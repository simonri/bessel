from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from api.calendars.google import CONTACTS_WRITE_SCOPE
from api.calendars.service import calendar_service
from api.common.pagination import PaginationParamsQuery
from api.contacts.editing import contact_editor
from api.contacts.repository import ContactRepository, ContactSourceRepository
from api.contacts.schemas import ContactAuthorizeResponse, ContactCreate, ContactListResponse, ContactSchema, ContactSourceSchema, ContactUpdate
from api.contacts.service import request_sync
from api.exceptions import ResourceNotFound
from api.postgres import DBSession
from api.redis import Redis, get_redis
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
  result = []
  for source in sources:
    account = await repo.account_for(source)
    result.append(
      ContactSourceSchema(id=source.id, email=account.email, synced_at=source.synced_at, sync_error=source.sync_error, can_edit=account.can_write_contacts)
    )
  return result


@router.post("/sync", summary="Sync Contacts", status_code=202)
async def sync_contacts(session: DBSession, current_user: CurrentDBUser) -> None:
  """Fetches what changed in the user's address books now rather than at the next scheduled sync."""
  for source in await ContactSourceRepository.from_session(session).ensure_for_user(current_user.id):
    request_sync(source.id)


@router.get("/{contact_id}", summary="Get Contact", response_model=ContactSchema)
async def get_contact(session: DBSession, current_user: CurrentDBUser, contact_id: UUID) -> ContactSchema:
  contact = await ContactRepository.from_session(session).get_owned_or_404(contact_id, current_user.id, not_found_message="Contact not found.")
  return ContactSchema.model_validate(contact)


@router.post("/sources/{source_id}/authorize", summary="Allow Contact Editing", response_model=ContactAuthorizeResponse)
async def authorize_contact_editing(session: DBSession, current_user: CurrentDBUser, source_id: UUID) -> ContactAuthorizeResponse:
  """Google's page for granting Bessel permission to change this account's contacts, on top of what it already allows."""
  sources = ContactSourceRepository.from_session(session)
  source = await sources.get_by_id(source_id)
  if source is None or source.user_id != current_user.id:
    raise ResourceNotFound("Address book not found.")
  account = await sources.account_for(source)
  return ContactAuthorizeResponse(url=calendar_service.google_authorize_url(current_user.id, scopes=CONTACTS_WRITE_SCOPE, login_hint=account.email))


@router.post("", summary="Create Contact", response_model=ContactSchema, status_code=201)
async def create_contact(session: DBSession, current_user: CurrentDBUser, body: ContactCreate, redis: Annotated[Redis, Depends(get_redis)]) -> ContactSchema:
  """Adds the person to the Google address book, from where it reaches the phone."""
  changes = body.model_dump(exclude_unset=True, exclude={"source_id"})
  contact = await contact_editor.create(session, redis, current_user.id, body.source_id, changes)
  return ContactSchema.model_validate(contact)


@router.patch("/{contact_id}", summary="Update Contact", response_model=ContactSchema)
async def update_contact(
  session: DBSession, current_user: CurrentDBUser, contact_id: UUID, body: ContactUpdate, redis: Annotated[Redis, Depends(get_redis)]
) -> ContactSchema:
  """Changes the fields sent (null clears one) in Google; numbers and emails sent replace the list."""
  contact = await contact_editor.update(session, redis, current_user.id, contact_id, body.model_dump(exclude_unset=True))
  return ContactSchema.model_validate(contact)


@router.delete("/{contact_id}", summary="Delete Contact", status_code=204)
async def delete_contact(session: DBSession, current_user: CurrentDBUser, contact_id: UUID, redis: Annotated[Redis, Depends(get_redis)]) -> None:
  """Deletes the person from Google, and so from the phone's synced contacts."""
  await contact_editor.delete(session, redis, current_user.id, contact_id)
