from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from api.calendars.google import CONTACTS_WRITE_SCOPE
from api.calendars.service import calendar_service
from api.common.pagination import PaginationParamsQuery
from api.contacts.editing import contact_editor
from api.contacts.keeping import (
  contact_schema,
  contact_schemas,
  delete_interaction,
  dismiss_event,
  follow_ups,
  log_interaction,
  meeting_brief,
  reminders,
  timeline,
  update_tags,
)
from api.contacts.repository import ContactRepository, ContactSourceRepository
from api.contacts.schemas import (
  ContactAuthorizeResponse,
  ContactCreate,
  ContactEventDismiss,
  ContactFollowUp,
  ContactInteractionCreate,
  ContactInteractionSchema,
  ContactListResponse,
  ContactPhotoUpdate,
  ContactReminders,
  ContactSchema,
  ContactSourceSchema,
  ContactTagsUpdate,
  ContactUpdate,
  MeetingBrief,
)
from api.contacts.service import request_sync
from api.exceptions import ResourceNotFound
from api.models.contact import ContactInteractionSource
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
  return ContactListResponse.from_paginated_results(await contact_schemas(session, current_user, items), total_count, pagination)


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


@router.get("/reminders", summary="Get Contact Reminders", response_model=ContactReminders)
async def get_contact_reminders(
  session: DBSession,
  current_user: CurrentDBUser,
  days: int = Query(default=14, ge=1, le=366, description="How many days ahead to look, today included."),
) -> ContactReminders:
  """Birthdays and other dates coming up in the address book."""
  return await reminders(session, current_user, days=days)


@router.get("/follow-ups", summary="List Contact Follow Ups", response_model=list[ContactFollowUp])
async def list_contact_follow_ups(session: DBSession, current_user: CurrentDBUser) -> list[ContactFollowUp]:
  """Calendar events that ended lately with people who were there ("anything to note?") or might have been ("were they?")."""
  return await follow_ups(session, current_user)


@router.get("/brief", summary="Get Meeting Brief", response_model=MeetingBrief)
async def get_meeting_brief(
  session: DBSession, current_user: CurrentDBUser, calendar_event_id: Annotated[UUID, Query(description="The calendar event to brief.")]
) -> MeetingBrief:
  """Who of the user's contacts is at an event, with when they were last seen and what was logged with them lately."""
  return await meeting_brief(session, current_user, calendar_event_id)


@router.get("/{contact_id}", summary="Get Contact", response_model=ContactSchema)
async def get_contact(session: DBSession, current_user: CurrentDBUser, contact_id: UUID) -> ContactSchema:
  contact = await ContactRepository.from_session(session).get_owned_or_404(contact_id, current_user.id, not_found_message="Contact not found.")
  return await contact_schema(session, current_user, contact)


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
  return await contact_schema(session, current_user, contact)


@router.patch("/{contact_id}", summary="Update Contact", response_model=ContactSchema)
async def update_contact(
  session: DBSession, current_user: CurrentDBUser, contact_id: UUID, body: ContactUpdate, redis: Annotated[Redis, Depends(get_redis)]
) -> ContactSchema:
  """Changes the fields sent (null clears one) in Google; numbers and emails sent replace the list."""
  contact = await contact_editor.update(session, redis, current_user.id, contact_id, body.model_dump(exclude_unset=True))
  return await contact_schema(session, current_user, contact)


@router.put("/{contact_id}/photo", summary="Update Contact Photo", response_model=ContactSchema)
async def update_contact_photo(
  session: DBSession, current_user: CurrentDBUser, contact_id: UUID, body: ContactPhotoUpdate, redis: Annotated[Redis, Depends(get_redis)]
) -> ContactSchema:
  """Replaces the person's photo in Google, from where it reaches the phone."""
  contact = await contact_editor.set_photo(session, redis, current_user.id, contact_id, body.image_bytes())
  return await contact_schema(session, current_user, contact)


@router.put("/{contact_id}/tags", summary="Update Contact Tags", response_model=ContactSchema)
async def update_contact_tags(session: DBSession, current_user: CurrentDBUser, contact_id: UUID, body: ContactTagsUpdate) -> ContactSchema:
  """Replaces Bessel's own tags on a contact, which never reach Google."""
  return await update_tags(session, current_user, contact_id, body.tags)


@router.get("/{contact_id}/interactions", summary="List Contact Interactions", response_model=list[ContactInteractionSchema])
async def list_contact_interactions(session: DBSession, current_user: CurrentDBUser, contact_id: UUID) -> list[ContactInteractionSchema]:
  """What was logged with someone, and the calendar events they were surely at, newest first."""
  return await timeline(session, current_user, contact_id)


@router.post("/{contact_id}/interactions", summary="Log Contact Interaction", response_model=ContactInteractionSchema, status_code=201)
async def log_contact_interaction(
  session: DBSession, current_user: CurrentDBUser, contact_id: UUID, body: ContactInteractionCreate
) -> ContactInteractionSchema:
  """Adds to someone's log, kept in Bessel only. Logging a calendar event they were at again updates its note."""
  return await log_interaction(session, current_user, contact_id, body.model_dump(exclude_unset=True), source=ContactInteractionSource.manual)


@router.delete("/{contact_id}/interactions/{interaction_id}", summary="Delete Contact Interaction", status_code=204)
async def delete_contact_interaction(session: DBSession, current_user: CurrentDBUser, contact_id: UUID, interaction_id: UUID) -> None:
  await delete_interaction(session, current_user, contact_id, interaction_id)


@router.post("/{contact_id}/dismissals", summary="Dismiss Contact At Event", status_code=204)
async def dismiss_contact_at_event(session: DBSession, current_user: CurrentDBUser, contact_id: UUID, body: ContactEventDismiss) -> None:
  """The contact wasn't at the calendar event, so it isn't suggested again."""
  await dismiss_event(session, current_user, contact_id, body.calendar_event_id)


@router.delete("/{contact_id}", summary="Delete Contact", status_code=204)
async def delete_contact(session: DBSession, current_user: CurrentDBUser, contact_id: UUID, redis: Annotated[Redis, Depends(get_redis)]) -> None:
  """Deletes the person from Google, and so from the phone's synced contacts."""
  await contact_editor.delete(session, redis, current_user.id, contact_id)
