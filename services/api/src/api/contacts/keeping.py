"""Bessel's own layer on the address book: when the user last saw someone, who
they meant to keep in touch with, and whose birthday is coming up."""

import re
from collections.abc import Sequence
from datetime import date, datetime, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.ext.asyncio import AsyncSession

from api.calendars.repository import CalendarEventRepository
from api.common.utils import utc_now
from api.contacts.repository import ContactRepository
from api.contacts.schemas import BirthdayReminder, CatchUpReminder, ContactReference, ContactReminders, ContactSchema, ContactSighting
from api.models.calendar_event import CalendarEvent
from api.models.contact import Contact, ContactMethodKind
from api.models.user import User

# How far back the calendar is searched for the last time someone was seen.
LOOKBACK = timedelta(days=365)
# Shorter names ("Bo") would match inside too many event titles.
MIN_NAME_LENGTH = 4


def user_zone(user: User) -> ZoneInfo:
  try:
    return ZoneInfo(user.timezone or "UTC")
  except (ZoneInfoNotFoundError, ValueError):
    return ZoneInfo("UTC")


def next_birthday(month: int, day: int, today: date) -> date:
  """The next time the birthday comes round, today included; 29 February falls on the 28th in other years."""
  for year in (today.year, today.year + 1):
    try:
      birthday = date(year, month, day)
    except ValueError:
      birthday = date(year, month, day - 1)
    if birthday >= today:
      return birthday
  raise AssertionError("unreachable")


class _Matcher:
  """Finds someone on an event: as a guest who didn't decline, as its organizer, or named in its title."""

  def __init__(self, contact: Contact) -> None:
    self.emails = {m.value.strip().lower() for m in contact.methods if m.kind == ContactMethodKind.email}
    name = contact.display_name.strip()
    self.name = re.compile(rf"(?<!\w){re.escape(name)}(?!\w)", re.IGNORECASE) if len(name) >= MIN_NAME_LENGTH else None

  def on(self, event: CalendarEvent) -> bool:
    if self.emails:
      if event.creator_email and event.creator_email.lower() in self.emails:
        return True
      if any((a.get("email") or "").lower() in self.emails and a.get("response") != "declined" for a in event.attendees):
        return True
    return self.name is not None and self.name.search(event.title) is not None


def _event_day(event: CalendarEvent, zone: ZoneInfo) -> date:
  if event.start_at is not None:
    return event.start_at.astimezone(zone).date()
  assert event.start_date is not None
  return event.start_date


def last_seen(contact: Contact, events: Sequence[CalendarEvent], zone: ZoneInfo) -> ContactSighting | None:
  """The later of the last event they were on (`events` newest first) and the day the user marked as caught up."""
  matcher = _Matcher(contact)
  event = next((e for e in events if matcher.on(e)), None)
  seen = ContactSighting(on=_event_day(event, zone), event_title=event.title) if event is not None else None
  if contact.caught_up_on is not None and (seen is None or contact.caught_up_on > seen.on):
    return ContactSighting(on=contact.caught_up_on, event_title=None)
  return seen


def catch_up_on(contact: Contact, seen: ContactSighting | None, today: date) -> date | None:
  if contact.keep_in_touch_days is None:
    return None
  return seen.on + timedelta(days=contact.keep_in_touch_days) if seen is not None else today


async def _attended(session: AsyncSession, user: User, now: datetime) -> Sequence[CalendarEvent]:
  return await CalendarEventRepository.from_session(session).list_attended(user.id, now - LOOKBACK, now)


async def contact_schemas(session: AsyncSession, user: User, contacts: Sequence[Contact]) -> list[ContactSchema]:
  """The contacts as the API shows them, with when they were last seen and when to catch up."""
  if not contacts:
    return []
  now = utc_now()
  zone = user_zone(user)
  today = now.astimezone(zone).date()
  events = await _attended(session, user, now)
  schemas = []
  for contact in contacts:
    seen = last_seen(contact, events, zone)
    schema = ContactSchema.model_validate(contact)
    schemas.append(schema.model_copy(update={"last_seen": seen, "catch_up_on": catch_up_on(contact, seen, today)}))
  return schemas


async def contact_schema(session: AsyncSession, user: User, contact: Contact) -> ContactSchema:
  return (await contact_schemas(session, user, [contact]))[0]


async def reminders(session: AsyncSession, user: User, *, days: int) -> ContactReminders:
  """Birthdays in the next `days` days, today included, and everyone it's time to catch up with."""
  now = utc_now()
  zone = user_zone(user)
  today = now.astimezone(zone).date()
  contacts = await ContactRepository.from_session(session).list_for_user(user.id)

  birthdays = []
  for contact in contacts:
    if contact.birthday_month is None or contact.birthday_day is None:
      continue
    on = next_birthday(contact.birthday_month, contact.birthday_day, today)
    if on <= today + timedelta(days=days - 1):
      turns = on.year - contact.birthday_year if contact.birthday_year else None
      birthdays.append(BirthdayReminder(contact=_reference(contact), on=on, turns=turns))
  birthdays.sort(key=lambda b: (b.on, b.contact.display_name.lower()))

  keeping = [c for c in contacts if c.keep_in_touch_days is not None]
  events = await _attended(session, user, now) if keeping else []
  catch_up = []
  for contact in keeping:
    seen = last_seen(contact, events, zone)
    due = catch_up_on(contact, seen, today)
    if due is not None and due <= today:
      catch_up.append(CatchUpReminder(contact=_reference(contact), due_on=due, last_seen=seen))
  catch_up.sort(key=lambda c: (c.due_on, c.contact.display_name.lower()))
  return ContactReminders(birthdays=birthdays, catch_up=catch_up)


def _reference(contact: Contact) -> ContactReference:
  return ContactReference(id=contact.id, display_name=contact.display_name, photo_url=contact.photo_url)


async def update_keep_up(session: AsyncSession, user: User, contact_id: UUID, changes: dict[str, Any]) -> ContactSchema:
  contact = await ContactRepository.from_session(session).get_owned_or_404(contact_id, user.id, not_found_message="Contact not found.")
  if "tags" in changes:
    contact.tags = changes["tags"] or []
  if "keep_in_touch_days" in changes:
    contact.keep_in_touch_days = changes["keep_in_touch_days"]
  if "caught_up_on" in changes:
    contact.caught_up_on = changes["caught_up_on"]
  await session.flush()
  return await contact_schema(session, user, contact)
