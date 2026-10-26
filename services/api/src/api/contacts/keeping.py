"""Bessel's own layer on the address book: what happened with someone (the log), when they were last
seen, which calendar events they were at, and the dates coming up."""

import re
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.ext.asyncio import AsyncSession

from api.calendars.repository import CalendarAccountRepository, CalendarEventRepository
from api.common.utils import utc_now
from api.contacts.repository import ContactEventDismissalRepository, ContactInteractionRepository, ContactRepository
from api.contacts.schemas import (
  ContactDateReminder,
  ContactFollowUp,
  ContactFollowUpEvent,
  ContactInteractionSchema,
  ContactReference,
  ContactReminders,
  ContactSchema,
  ContactSighting,
  MeetingBrief,
  MeetingBriefPerson,
  dates_of,
)
from api.exceptions import ResourceNotFound, ValidationError
from api.models.calendar_event import CalendarEvent
from api.models.contact import Contact, ContactInteraction, ContactInteractionKind, ContactInteractionSource, ContactMethodKind
from api.models.user import User

# How far back the calendar is searched for the last time someone was seen.
LOOKBACK = timedelta(days=365)
# "Anything to note about X?" follows an event for this long after it ends.
NOTE_WINDOW = timedelta(days=3)
# "Was X there?" asks about events this far back.
CONFIRM_WINDOW = timedelta(days=30)
FOLLOW_UP_LIMIT = 10
TIMELINE_LIMIT = 100
BRIEF_RECENT = 3
BRIEF_DATES_DAYS = 14
# Shorter first names ("Bo") would match inside too many titles.
MIN_FIRST_NAME = 3


def user_zone(user: User) -> ZoneInfo:
  try:
    return ZoneInfo(user.timezone or "UTC")
  except (ZoneInfoNotFoundError, ValueError):
    return ZoneInfo("UTC")


def next_occurrence(month: int, day: int, today: date) -> date:
  """The next time a yearly date comes round, today included; 29 February falls on the 28th in other years."""
  for year in (today.year, today.year + 1):
    try:
      when = date(year, month, day)
    except ValueError:
      when = date(year, month, day - 1)
    if when >= today:
      return when
  raise AssertionError("unreachable")


def event_key(event: CalendarEvent) -> str:
  return f"{event.calendar_id}:{event.external_id}"


def _event_day(event: CalendarEvent, zone: ZoneInfo) -> date:
  if event.start_at is not None:
    return event.start_at.astimezone(zone).date()
  assert event.start_date is not None
  return event.start_date


def _ended(event: CalendarEvent, now: datetime, zone: ZoneInfo) -> datetime | None:
  """When the event ended, or None while it's still on."""
  if event.end_at is not None:
    return event.end_at if event.end_at <= now else None
  assert event.end_date is not None
  # All-day events end at the start of their (exclusive) end date, in the user's day.
  end = datetime.combine(event.end_date, datetime.min.time(), zone)
  return end if end <= now else None


def _whole_word(text: str) -> re.Pattern[str]:
  return re.compile(rf"(?<!\w){re.escape(text)}(?!\w)", re.IGNORECASE)


def _first_name(contact: Contact) -> str | None:
  """What a title like "Lunch with Anna" would call them: the first given name, else a one-word name."""
  if contact.given_name:
    return contact.given_name.split()[0]
  name = contact.display_name.strip()
  return name if name and " " not in name else None


@dataclass(frozen=True)
class _Person:
  contact: Contact
  emails: frozenset[str]
  name: str
  full_name: re.Pattern[str] | None
  first_name: re.Pattern[str] | None


class Matcher:
  """Who of the user's contacts was at a calendar event.

  Sure: a guest (who didn't decline) or the organizer by email, a guest by name, or named in full in the title.
  Possible: named in the title by a first name only one contact has. The user's own card never matches.
  """

  def __init__(self, contacts: Iterable[Contact], own_emails: set[str]) -> None:
    contacts = list(contacts)
    firsts = Counter(name.casefold() for c in contacts if (name := _first_name(c)))
    self.people: list[_Person] = []
    for contact in contacts:
      emails = frozenset(m.value.strip().lower() for m in contact.methods if m.kind == ContactMethodKind.email)
      if emails & own_emails:
        continue
      name = contact.display_name.strip()
      first = _first_name(contact)
      self.people.append(
        _Person(
          contact=contact,
          emails=emails,
          name=name.casefold(),
          full_name=_whole_word(name) if " " in name else None,
          first_name=_whole_word(first) if first and len(first) >= MIN_FIRST_NAME and firsts[first.casefold()] == 1 else None,
        )
      )

  def match(self, event: CalendarEvent) -> dict[UUID, bool]:
    """Contact id -> whether they were surely there (True) or possibly (False)."""
    guests = [a for a in event.attendees if not a.get("is_self") and a.get("response") != "declined"]
    emails = {(a.get("email") or "").lower() for a in guests}
    if event.creator_email:
      emails.add(event.creator_email.lower())
    names = {(a.get("name") or "").strip().casefold() for a in guests} - {""}
    found: dict[UUID, bool] = {}
    for person in self.people:
      if person.emails & emails or person.name in names or (person.full_name and person.full_name.search(event.title)):
        found[person.contact.id] = True
      elif person.first_name and person.first_name.search(event.title):
        found[person.contact.id] = False
    return found


class _Context:
  """What the calendar and the log say, loaded once per request."""

  def __init__(self, session: AsyncSession, user: User) -> None:
    self.session = session
    self.user = user
    self.now = utc_now()
    self.zone = user_zone(user)
    self.today = self.now.astimezone(self.zone).date()

  async def own_emails(self) -> set[str]:
    return {a.email.lower() for a in await CalendarAccountRepository.from_session(self.session).list_for_user(self.user.id)}

  async def attended(self, since: timedelta) -> Sequence[CalendarEvent]:
    """Past events the user didn't decline, newest first."""
    return await CalendarEventRepository.from_session(self.session).list_attended(self.user.id, self.now - since, self.now)

  async def matcher(self, contacts: Iterable[Contact]) -> Matcher:
    return Matcher(contacts, await self.own_emails())

  def day(self, event: CalendarEvent) -> date:
    return _event_day(event, self.zone)


def _sighting_of(interaction: ContactInteraction) -> ContactSighting:
  return ContactSighting(on=interaction.occurred_on, kind=interaction.kind, summary=interaction.event_title or interaction.note)


def _last_seen(logged: ContactInteraction | None, event: CalendarEvent | None, ctx: _Context) -> ContactSighting | None:
  seen = _sighting_of(logged) if logged is not None else None
  if event is not None and (seen is None or ctx.day(event) > seen.on):
    return ContactSighting(on=ctx.day(event), kind=ContactInteractionKind.event, summary=event.title)
  return seen


def _sure_events(matcher: Matcher, events: Sequence[CalendarEvent]) -> dict[UUID, list[CalendarEvent]]:
  """Each contact's events they were surely at, newest first."""
  by_contact: dict[UUID, list[CalendarEvent]] = {}
  for event in events:
    for contact_id, sure in matcher.match(event).items():
      if sure:
        by_contact.setdefault(contact_id, []).append(event)
  return by_contact


async def _last_seen_for(ctx: _Context, contacts: Sequence[Contact]) -> dict[UUID, ContactSighting | None]:
  sure = _sure_events(await ctx.matcher(contacts), await ctx.attended(LOOKBACK))
  latest = await ContactInteractionRepository.from_session(ctx.session).latest_for_contacts([c.id for c in contacts])
  return {c.id: _last_seen(latest.get(c.id), next(iter(sure.get(c.id, [])), None), ctx) for c in contacts}


async def contact_schemas(session: AsyncSession, user: User, contacts: Sequence[Contact]) -> list[ContactSchema]:
  """The contacts as the API shows them, with when each was last seen."""
  if not contacts:
    return []
  seen = await _last_seen_for(_Context(session, user), contacts)
  return [ContactSchema.model_validate(c).model_copy(update={"last_seen": seen[c.id]}) for c in contacts]


async def contact_schema(session: AsyncSession, user: User, contact: Contact) -> ContactSchema:
  return (await contact_schemas(session, user, [contact]))[0]


async def _owned(session: AsyncSession, user: User, contact_id: UUID) -> Contact:
  return await ContactRepository.from_session(session).get_owned_or_404(contact_id, user.id, not_found_message="Contact not found.")


def _entry(interaction: ContactInteraction) -> ContactInteractionSchema:
  return ContactInteractionSchema(
    id=interaction.id,
    occurred_on=interaction.occurred_on,
    kind=interaction.kind,
    source=interaction.source,
    note=interaction.note,
    event_title=interaction.event_title,
  )


async def timeline(session: AsyncSession, user: User, contact_id: UUID) -> list[ContactInteractionSchema]:
  """What was logged with someone and the calendar events they were surely at, newest first."""
  ctx = _Context(session, user)
  contact = await _owned(session, user, contact_id)
  logged = await ContactInteractionRepository.from_session(session).list_for_contact(contact, limit=TIMELINE_LIMIT)
  keys = {i.event_key for i in logged if i.event_key}
  matcher = await ctx.matcher(await ContactRepository.from_session(session).list_for_user(user.id))
  events = [e for e in _sure_events(matcher, await ctx.attended(LOOKBACK)).get(contact.id, []) if event_key(e) not in keys]
  entries = [_entry(i) for i in logged] + [
    ContactInteractionSchema(
      id=None, occurred_on=ctx.day(e), kind=ContactInteractionKind.event, source=ContactInteractionSource.calendar, note=None, event_title=e.title
    )
    for e in events
  ]
  return sorted(entries, key=lambda e: e.occurred_on, reverse=True)[:TIMELINE_LIMIT]


async def _event(session: AsyncSession, user: User, event_id: UUID) -> CalendarEvent:
  event, _, _ = await CalendarEventRepository.from_session(session).get_owned_with_context(event_id, user.id)
  return event


async def log_interaction(
  session: AsyncSession, user: User, contact_id: UUID, body: dict[str, Any], *, source: ContactInteractionSource
) -> ContactInteractionSchema:
  """Adds an entry to someone's log. Logging the same calendar event again updates its note."""
  ctx = _Context(session, user)
  contact = await _owned(session, user, contact_id)
  repository = ContactInteractionRepository.from_session(session)
  note = (body.get("note") or "").strip() or None
  kind = body.get("kind") or ContactInteractionKind.met
  occurred_on = body.get("occurred_on") or ctx.today
  key = title = None
  if (event_id := body.get("calendar_event_id")) is not None:
    event = await _event(session, user, event_id)
    key, title, kind, occurred_on = event_key(event), event.title, ContactInteractionKind.event, ctx.day(event)
    existing = await repository.get_for_event(contact, key)
    if existing is not None:
      if note:
        existing.note = note
        await session.flush()
      return _entry(existing)
  if occurred_on > ctx.today:
    raise ValidationError("That day hasn't happened yet.", status_code=422)
  interaction = ContactInteraction(
    user_id=user.id, contact_id=contact.id, occurred_on=occurred_on, kind=kind, source=source, note=note, event_key=key, event_title=title
  )
  await repository.create(interaction, flush=True)
  return _entry(interaction)


async def delete_interaction(session: AsyncSession, user: User, contact_id: UUID, interaction_id: UUID) -> None:
  contact = await _owned(session, user, contact_id)
  repository = ContactInteractionRepository.from_session(session)
  interaction = await repository.get_for_contact(contact, interaction_id)
  if interaction is None:
    raise ResourceNotFound("Entry not found.")
  await repository.remove(interaction)


async def dismiss_event(session: AsyncSession, user: User, contact_id: UUID, event_id: UUID) -> None:
  """The user says the contact wasn't at the event, so it isn't suggested again."""
  contact = await _owned(session, user, contact_id)
  event = await _event(session, user, event_id)
  await ContactEventDismissalRepository.from_session(session).dismiss(contact, event_key(event))


def _reference(contact: Contact) -> ContactReference:
  return ContactReference(id=contact.id, display_name=contact.display_name, photo_url=contact.photo_url)


async def follow_ups(session: AsyncSession, user: User) -> list[ContactFollowUp]:
  """Events that ended lately with people who were surely there ("anything to note?") or possibly ("were they?"),
  newest first, leaving out what's already logged or dismissed."""
  ctx = _Context(session, user)
  contacts = {c.id: c for c in await ContactRepository.from_session(session).list_for_user(user.id)}
  matcher = await ctx.matcher(contacts.values())
  handled = await ContactInteractionRepository.from_session(session).logged_events(user.id)
  handled |= await ContactEventDismissalRepository.from_session(session).keys_for_user(user.id)
  found: list[ContactFollowUp] = []
  for event in await ctx.attended(CONFIRM_WINDOW):
    ended = _ended(event, ctx.now, ctx.zone)
    if ended is None:
      continue
    key = event_key(event)
    for contact_id, sure in matcher.match(event).items():
      if (contact_id, key) in handled or (sure and ctx.now - ended > NOTE_WINDOW):
        continue
      found.append(
        ContactFollowUp(
          kind="note" if sure else "confirm",
          contact=_reference(contacts[contact_id]),
          event=ContactFollowUpEvent(id=event.id, title=event.title, on=ctx.day(event)),
        )
      )
      if len(found) == FOLLOW_UP_LIMIT:
        return found
  return found


def _dates(contact: Contact, today: date, days: int) -> list[ContactDateReminder]:
  """The contact's birthday and other dates in the next `days` days, today included."""
  yearly: list[tuple[str, int, int, int | None]] = []
  if contact.birthday_month and contact.birthday_day:
    yearly.append(("Birthday", contact.birthday_month, contact.birthday_day, contact.birthday_year))
  yearly += [(d["label"], d["month"], d["day"], d["year"]) for d in dates_of(contact.person)]
  found = []
  for label, month, day, year in yearly:
    on = next_occurrence(month, day, today)
    if on <= today + timedelta(days=days - 1):
      found.append(ContactDateReminder(contact=_reference(contact), label=label, on=on, years=on.year - year if year else None))
  return found


async def reminders(session: AsyncSession, user: User, *, days: int) -> ContactReminders:
  """Birthdays and other dates in the next `days` days, today included."""
  today = _Context(session, user).today
  contacts = await ContactRepository.from_session(session).list_for_user(user.id)
  dates = [reminder for contact in contacts for reminder in _dates(contact, today, days)]
  return ContactReminders(dates=sorted(dates, key=lambda d: (d.on, d.contact.display_name.lower())))


async def meeting_brief(session: AsyncSession, user: User, event_id: UUID) -> MeetingBrief:
  """Who of the user's contacts is at an event, with when they were last seen, what was logged lately and any date coming up."""
  ctx = _Context(session, user)
  event = await _event(session, user, event_id)
  contacts = {c.id: c for c in await ContactRepository.from_session(session).list_for_user(user.id)}
  matched = (await ctx.matcher(contacts.values())).match(event)
  people = sorted(matched.items(), key=lambda item: (not item[1], contacts[item[0]].display_name.lower()))
  attending = [contacts[contact_id] for contact_id, _ in people]
  seen = await _last_seen_for(ctx, attending) if attending else {}
  repository = ContactInteractionRepository.from_session(session)
  brief = []
  for contact_id, sure in people:
    contact = contacts[contact_id]
    recent = await repository.list_for_contact(contact, limit=BRIEF_RECENT)
    dates = _dates(contact, ctx.today, BRIEF_DATES_DAYS)
    brief.append(
      MeetingBriefPerson(
        contact=_reference(contact), sure=sure, last_seen=seen[contact_id], recent=[_entry(i) for i in recent], upcoming=dates[0] if dates else None
      )
    )
  return MeetingBrief(event=ContactFollowUpEvent(id=event.id, title=event.title, on=ctx.day(event)), people=brief)


async def update_tags(session: AsyncSession, user: User, contact_id: UUID, tags: list[str]) -> ContactSchema:
  contact = await _owned(session, user, contact_id)
  contact.tags = tags
  await session.flush()
  return await contact_schema(session, user, contact)
