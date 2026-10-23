"""Invoices and receipts kept with transactions."""

import hashlib
from uuid import UUID

from sqlalchemy.exc import IntegrityError

from api.common.file_storage import file_storage
from api.common.uploads import detect_document_type
from api.documents.previews import MAX_PREVIEW_PAGES, render_previews
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
      await repository.link(transaction.id, existing.id)
      return existing

    if await repository.total_bytes_for_user(transaction.user_id) + len(content) > MAX_DOCUMENT_STORAGE_PER_USER_BYTES:
      raise ValidationError("Storage for invoices and receipts is full (2 GB).", status_code=413)
    previews = await render_previews(content, content_type)
    document = Document(
      user_id=transaction.user_id,
      filename=(filename or "document")[:255],
      content_type=content_type,
      size_bytes=len(content),
      sha256=sha256,
      page_count=previews.page_count,
    )
    try:
      async with session.begin_nested():
        await repository.create(document, flush=True)
    except IntegrityError:
      # The same file, uploaded at the same moment by another request: link that one instead.
      existing = await repository.get_by_checksum(transaction.user_id, sha256)
      if existing is None:
        raise
      await repository.link(transaction.id, existing.id)
      return existing
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
    await repository.lock(document.id)
    if await repository.unlink(transaction.id, document.id) > 0:
      return
    await self._delete(repository, document)

  async def prune(self, session: AsyncSession, user_id: UUID) -> int:
    """Deletes the user's documents left without a transaction, files and all; returns how many."""
    repository = DocumentRepository.from_session(session)
    unlinked = await repository.unlinked_for_user(user_id)
    for document in unlinked:
      await self._delete(repository, document)
    return len(unlinked)

  async def _delete(self, repository: DocumentRepository, document: Document) -> None:
    previews = min(document.page_count, MAX_PREVIEW_PAGES)
    keys = [original_key(document.id), thumbnail_key(document.id), *(page_key(document.id, page) for page in range(1, previews + 1))]
    await repository.delete(document, flush=True)
    storage = file_storage()
    for key in keys:
      await storage.delete(key)


document_service = DocumentService()
