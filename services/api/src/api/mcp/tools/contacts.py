from datetime import date
from typing import Annotated
from uuid import UUID

from mcp.server.mcpserver import Context
from pydantic import Field

from api.common.schemas import Schema
from api.contacts.keeping import contact_schema, meeting_brief, reminders, timeline
from api.contacts.keeping import log_interaction as log_contact_interaction
from api.contacts.repository import ContactRepository
from api.contacts.schemas import ContactInteractionSchema, ContactReminders, ContactSchema, MeetingBrief
from api.mcp.context import user_session
from api.mcp.tools.common import ToolSpec, read, write
from api.models.contact import ContactInteractionKind, ContactInteractionSource, ContactMethodKind

RECENT_ENTRIES = 10


class ContactSummary(Schema):
  id: UUID
  name: str
  organization: str | None
  phones: list[str]
  emails: list[str]
  tags: list[str]


class Contacts(Schema):
  total_count: int
  contacts: list[ContactSummary] = Field(description="Alphabetical by name.")


async def find_contacts(
  ctx: Context,
  search: Annotated[str | None, Field(description="Part of a name, company, tag, phone number or email. Omit to list everyone.")] = None,
  limit: Annotated[int, Field(ge=1, le=100)] = 20,
) -> Contacts:
  """People in the user's address book (mirrored from their Google contacts), with their numbers and emails.

  Use it to look someone up ("what's Anna's number?") or to find who a number or email belongs to. Follow up
  with get_contact for addresses, birthday and notes.
  """
  async with user_session(ctx) as (session, user):
    repo = ContactRepository.from_session(session)
    rows, total_count = await repo.paginate(repo.get_filtered_statement(user.id, search=search), limit=limit, page=1)
    contacts = [
      ContactSummary(
        id=c.id,
        name=c.display_name,
        organization=c.organization,
        phones=[m.value for m in c.methods if m.kind == ContactMethodKind.phone],
        emails=[m.value for m in c.methods if m.kind == ContactMethodKind.email],
        tags=c.tags,
      )
      for c in rows
    ]
  return Contacts(total_count=total_count, contacts=contacts)


class ContactWithLog(Schema):
  contact: ContactSchema
  recent: list[ContactInteractionSchema] = Field(description="What was logged with them and calendar events they were at, newest first.")


async def get_contact(ctx: Context, contact_id: UUID) -> ContactWithLog:
  """One person with every way to reach them, their addresses, birthday and other dates, the address book's notes,
  Bessel's own tags, when the user last saw them, and the latest of what's logged with them."""
  async with user_session(ctx) as (session, user):
    contact = await ContactRepository.from_session(session).get_owned_or_404(contact_id, user.id, not_found_message="Contact not found.")
    detail = await contact_schema(session, user, contact)
    recent = (await timeline(session, user, contact_id))[:RECENT_ENTRIES]
    return ContactWithLog(contact=detail, recent=recent)


async def get_contact_reminders(
  ctx: Context,
  days: Annotated[int, Field(ge=1, le=366, description="How many days ahead to look, today included.")] = 14,
) -> ContactReminders:
  """Birthdays, anniversaries and other dates coming up in the user's address book. Good for a morning briefing."""
  async with user_session(ctx) as (session, user):
    return await reminders(session, user, days=days)


async def get_meeting_brief(ctx: Context, calendar_event_id: UUID) -> MeetingBrief:
  """Who of the user's contacts is at a calendar event (from get_calendar_events), with when they last saw each
  and what was logged with them lately. Use it to prepare for a meeting."""
  async with user_session(ctx) as (session, user):
    return await meeting_brief(session, user, calendar_event_id)


async def log_interaction(
  ctx: Context,
  contact_id: UUID,
  note: Annotated[str | None, Field(max_length=2000, description="What happened or what they said, in a sentence or two.")] = None,
  kind: ContactInteractionKind = ContactInteractionKind.met,
  occurred_on: Annotated[date | None, Field(description="Defaults to today; can't be in the future.")] = None,
) -> ContactInteractionSchema:
  """Log something that happened with a contact ("had lunch with Anna, she's moving to Berlin") in the user's own log in
  Bessel. It never changes the address book itself. Use kind 'note' for something learned about them without meeting."""
  async with user_session(ctx) as (session, user):
    body = {"note": note, "kind": kind, "occurred_on": occurred_on}
    return await log_contact_interaction(session, user, contact_id, body, source=ContactInteractionSource.assistant)


# The address book itself is shared with the phone and only read here; the one write adds to Bessel's own log.
# Nothing over MCP deletes.
TOOLS: list[ToolSpec] = [
  read(find_contacts, "Find contacts"),
  read(get_contact, "Get contact"),
  read(get_contact_reminders, "Get contact reminders"),
  read(get_meeting_brief, "Get meeting brief"),
  write(log_interaction, "Log contact interaction"),
]
