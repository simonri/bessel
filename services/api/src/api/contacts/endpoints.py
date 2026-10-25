from uuid import UUID

from fastapi import APIRouter, Query

from api.common.pagination import PaginationParamsQuery
from api.contacts.repository import ContactRepository, ContactSourceRepository
from api.contacts.schemas import ContactListResponse, ContactSchema, ContactSourceSchema
from api.contacts.service import request_sync
from api.postgres import DBSession
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.get("", summary="List Contacts", response_model=ContactListResponse)
async def list_contacts(
  session: DBSession,
  current_user: CurrentDBUser,
  pagination: PaginationParamsQuery,
  search: str | None = Query(default=None, description="Matches names, companies, phone numbers and emails."),
) -> ContactListResponse:
  repo = ContactRepository.from_session(session)
  items, total_count = await repo.paginate(repo.get_filtered_statement(current_user.id, search=search), limit=pagination.limit, page=pagination.page)
  return ContactListResponse.from_paginated_results([ContactSchema.model_validate(c) for c in items], total_count, pagination)


@router.get("/sources", summary="List Contact Sources", response_model=list[ContactSourceSchema])
async def list_contact_sources(session: DBSession, current_user: CurrentDBUser) -> list[ContactSourceSchema]:
  """The Google accounts contacts come from, with how their last sync went."""
  repo = ContactSourceRepository.from_session(session)
  sources = await repo.ensure_for_user(current_user.id)
  return [
    ContactSourceSchema(id=source.id, email=await repo.account_email(source), synced_at=source.synced_at, sync_error=source.sync_error) for source in sources
  ]


@router.post("/sync", summary="Sync Contacts", status_code=202)
async def sync_contacts(session: DBSession, current_user: CurrentDBUser) -> None:
  """Fetches what changed in the user's address books now rather than at the next scheduled sync."""
  for source in await ContactSourceRepository.from_session(session).ensure_for_user(current_user.id):
    request_sync(source.id)


@router.get("/{contact_id}", summary="Get Contact", response_model=ContactSchema)
async def get_contact(session: DBSession, current_user: CurrentDBUser, contact_id: UUID) -> ContactSchema:
  contact = await ContactRepository.from_session(session).get_owned_or_404(contact_id, current_user.id, not_found_message="Contact not found.")
  return ContactSchema.model_validate(contact)
