"""Invoices and receipts kept with transactions."""

import hashlib
from uuid import UUID

from api.common.file_storage import file_storage
from api.common.uploads import detect_document_type
from api.documents.previews import render_previews
from api.documents.repository import DocumentRepository
from api.exceptions import ValidationError
from api.models.document import Document
from api.models.transaction import Transaction
from api.postgres import AsyncSession

MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
MAX_DOCUMENT_STORAGE_PER_USER_BYTES = 2 * 1024 * 1024 * 1024
PREVIEW_TYPE = "image/webp"


def original_key(document_id: UUID) -> str:
  return f"documents/{document_id}/original"


def page_key(document_id: UUID, page: int) -> str:
  return f"documents/{document_id}/page-{page}.webp"


def thumbnail_key(document_id: UUID) -> str:
  return f"documents/{document_id}/thumbnail.webp"


class DocumentService:
  async def attach(self, session: AsyncSession, transaction: Transaction, *, content: bytes, filename: str | None) -> Document:
    """Keeps the file with the transaction; the same file uploaded again is linked, not stored twice."""
    content_type = detect_document_type(content)
    if content_type is None:
      raise ValidationError("Only PDFs and photos (JPEG, PNG, WebP, HEIC) can be added.")
    repository = DocumentRepository.from_session(session)
    sha256 = hashlib.sha256(content).hexdigest()
    existing = await repository.get_by_checksum(transaction.user_id, sha256)
    if existing is not None:
      if not await repository.is_linked(transaction.id, existing.id):
        await repository.link(transaction.id, existing.id)
      return existing

    if await repository.total_bytes_for_user(transaction.user_id) + len(content) > MAX_DOCUMENT_STORAGE_PER_USER_BYTES:
      raise ValidationError("Storage for invoices and receipts is full (2 GB).", status_code=413)
    previews = await render_previews(content, content_type)
    document = await repository.create(
      Document(
        user_id=transaction.user_id,
        filename=(filename or "document")[:255],
        content_type=content_type,
        size_bytes=len(content),
        sha256=sha256,
        page_count=len(previews.pages),
      ),
      flush=True,
    )
    await repository.link(transaction.id, document.id)
    # Stored once the row has its id, which names the files.
    storage = file_storage()
    await storage.put(original_key(document.id), content, content_type)
    await storage.put(thumbnail_key(document.id), previews.thumbnail, PREVIEW_TYPE)
    for index, page in enumerate(previews.pages, start=1):
      await storage.put(page_key(document.id, index), page, PREVIEW_TYPE)
    return document

  async def detach(self, session: AsyncSession, transaction: Transaction, document: Document) -> None:
    """Takes the document off the transaction, and deletes it once it belongs to no transaction at all."""
    repository = DocumentRepository.from_session(session)
    if await repository.unlink(transaction.id, document.id) > 0:
      return
    keys = [original_key(document.id), thumbnail_key(document.id), *(page_key(document.id, page) for page in range(1, document.page_count + 1))]
    await repository.delete(document, flush=True)
    storage = file_storage()
    for key in keys:
      await storage.delete(key)


document_service = DocumentService()
