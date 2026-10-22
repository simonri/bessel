from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Response, UploadFile

from api.common.file_storage import file_storage
from api.common.uploads import read_upload
from api.documents.repository import DocumentRepository
from api.documents.schemas import DocumentSchema
from api.documents.service import MAX_DOCUMENT_BYTES, PREVIEW_TYPE, document_service, original_key, page_key, thumbnail_key
from api.exceptions import ResourceNotFound
from api.models.document import Document
from api.postgres import AsyncSession, DBSession
from api.transactions.repository import TransactionRepository
from api.users.dependencies import CurrentDBUser

router = APIRouter(tags=["documents"])

# Served for download only: never rendered as active content on the app's origin.
_SAFE_HEADERS = {"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox"}


async def _owned_document(session: AsyncSession, document_id: UUID, user_id: UUID) -> Document:
  return await DocumentRepository.from_session(session).get_owned_or_404(document_id, user_id, not_found_message="Document not found")


async def _stored(key: str) -> bytes:
  content = await file_storage().get(key)
  if content is None:
    raise ResourceNotFound("The file is missing.")
  return content


@router.get("/transactions/{transaction_id}/documents", summary="List Transaction Documents", response_model=list[DocumentSchema])
async def list_transaction_documents(transaction_id: UUID, session: DBSession, current_user: CurrentDBUser) -> list[DocumentSchema]:
  """The invoices and receipts kept with a transaction, oldest first."""
  await TransactionRepository.from_session(session).get_owned_or_404(transaction_id, current_user.id, not_found_message="Transaction not found")
  return [DocumentSchema.model_validate(d) for d in await DocumentRepository.from_session(session).for_transaction(transaction_id)]


@router.post("/transactions/{transaction_id}/documents", summary="Add Transaction Document", response_model=DocumentSchema, status_code=201)
async def add_transaction_document(transaction_id: UUID, file: UploadFile, session: DBSession, current_user: CurrentDBUser) -> DocumentSchema:
  """Keeps an invoice or receipt, a PDF or a photo, with the transaction."""
  transaction = await TransactionRepository.from_session(session).get_owned_or_404(transaction_id, current_user.id, not_found_message="Transaction not found")
  content = await read_upload(file, MAX_DOCUMENT_BYTES, "The file is too large (max 20 MB).")
  document = await document_service.attach(session, transaction, content=content, filename=file.filename)
  return DocumentSchema.model_validate(document)


@router.delete("/transactions/{transaction_id}/documents/{document_id}", summary="Remove Transaction Document", status_code=204)
async def remove_transaction_document(transaction_id: UUID, document_id: UUID, session: DBSession, current_user: CurrentDBUser) -> None:
  """Takes the document off the transaction; it's deleted once no transaction has it."""
  transaction = await TransactionRepository.from_session(session).get_owned_or_404(transaction_id, current_user.id, not_found_message="Transaction not found")
  document = await _owned_document(session, document_id, current_user.id)
  if not await DocumentRepository.from_session(session).is_linked(transaction.id, document.id):
    raise ResourceNotFound("Document not found")
  await document_service.detach(session, transaction, document)


@router.get("/documents/{document_id}/file", summary="Download Document")
async def download_document(document_id: UUID, session: DBSession, current_user: CurrentDBUser) -> Response:
  """The file as it was uploaded."""
  document = await _owned_document(session, document_id, current_user.id)
  return Response(
    content=await _stored(original_key(document.id)),
    media_type=document.content_type,
    headers={**_SAFE_HEADERS, "Content-Disposition": f"attachment; filename*=UTF-8''{quote(document.filename)}"},
  )


@router.get("/documents/{document_id}/pages/{page}", summary="Document Page Preview")
async def document_page(document_id: UUID, page: int, session: DBSession, current_user: CurrentDBUser) -> Response:
  """One page as an image, numbered from 1."""
  document = await _owned_document(session, document_id, current_user.id)
  return Response(content=await _stored(page_key(document.id, page)), media_type=PREVIEW_TYPE, headers=_SAFE_HEADERS)


@router.get("/documents/{document_id}/thumbnail", summary="Document Thumbnail")
async def document_thumbnail(document_id: UUID, session: DBSession, current_user: CurrentDBUser) -> Response:
  """A small image of the first page."""
  document = await _owned_document(session, document_id, current_user.id)
  return Response(content=await _stored(thumbnail_key(document.id)), media_type=PREVIEW_TYPE, headers=_SAFE_HEADERS)
