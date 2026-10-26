from typing import Annotated
from uuid import UUID

from mcp.server.mcpserver import Context
from pydantic import Field

from api.common.schemas import Schema
from api.contacts.keeping import contact_schema, reminders
from api.contacts.repository import ContactRepository
from api.contacts.schemas import ContactReminders, ContactSchema
from api.mcp.context import user_session
from api.mcp.tools.common import ToolSpec, read
from api.models.contact import ContactMethodKind


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


async def get_contact(ctx: Context, contact_id: UUID) -> ContactSchema:
  """One person with every way to reach them, their addresses, birthday and the address book's notes, plus
  Bessel's own tags, when the user last saw them and when they meant to be in touch next."""
  async with user_session(ctx) as (session, user):
    contact = await ContactRepository.from_session(session).get_owned_or_404(contact_id, user.id, not_found_message="Contact not found.")
    return await contact_schema(session, user, contact)


async def get_contact_reminders(
  ctx: Context,
  days: Annotated[int, Field(ge=1, le=366, description="How many days ahead to look for birthdays, today included.")] = 14,
) -> ContactReminders:
  """Upcoming birthdays in the user's address book, and the people they wanted to keep in touch with whom it's
  time to contact again. Good for a morning briefing or planning the week."""
  async with user_session(ctx) as (session, user):
    return await reminders(session, user, days=days)


# Read-only: the address book is shared with the phone, and nothing over MCP changes or deletes it.
TOOLS: list[ToolSpec] = [
  read(find_contacts, "Find contacts"),
  read(get_contact, "Get contact"),
  read(get_contact_reminders, "Get contact reminders"),
]
