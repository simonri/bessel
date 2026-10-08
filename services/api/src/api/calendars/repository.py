from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import and_, delete, func, literal_column, or_, select, union
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import selectinload

from api.calendars.providers import ProviderCalendar, ProviderEvent, ProviderPerson
from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.common.utils import generate_uuid, utc_now
from api.exceptions import ResourceNotFound
from api.models.calendar import Calendar
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.calendar_event import CalendarEvent
from api.models.calendar_person import CalendarPerson

UPSERT_BATCH_SIZE = 1000
_EVENT_SYNC_COLUMNS = (
  "title",
  "location",
  "all_day",
  "start_at",
  "end_at",
  "start_date",
  "end_date",
  "description",
  "creator_name",
  "creator_email",
  "attendees",
  "my_response",
  "conference_url",
  "html_link",
  "busy",
  "recurring",
  "visibility",
  "editable",
  "series_id",
  "original_start",
  "rrule",
  "etag",
  "resource_href",
  "color_id",
)


class CalendarAccountRepository(RepositoryBase[CalendarAccount], RepositoryIDMixin[CalendarAccount, UUID]):
  model = CalendarAccount

  async def list_for_user(self, user_id: UUID) -> Sequence[CalendarAccount]:
    statement = (
      self.get_base_statement().where(CalendarAccount.user_id == user_id).options(selectinload(CalendarAccount.calendars)).order_by(CalendarAccount.created_at)
    )
    return await self.get_all(statement)

  async def get_owned(self, account_id: UUID, user_id: UUID) -> CalendarAccount:
    statement = (
      self.get_base_statement().where(CalendarAccount.id == account_id, CalendarAccount.user_id == user_id).options(selectinload(CalendarAccount.calendars))
    )
    account = await self.get_one_or_none(statement)
    if account is None:
      raise ResourceNotFound("Calendar account not found")
    return account

  async def get_by_identity(self, user_id: UUID, provider: CalendarProvider, email: str) -> CalendarAccount | None:
    statement = self.get_base_statement().where(
      CalendarAccount.user_id == user_id,
      CalendarAccount.provider == provider,
      CalendarAccount.email == email,
    )
    return await self.get_one_or_none(statement)

  async def list_ids(self, provider: CalendarProvider | None = None) -> list[UUID]:
    statement = select(CalendarAccount.id)
    if provider is not None:
      statement = statement.where(CalendarAccount.provider == provider)
    result = await self.session.execute(statement)
    return list(result.scalars().all())


class CalendarRepository(RepositoryBase[Calendar], RepositoryIDMixin[Calendar, UUID]):
  model = Calendar

  async def get_owned(self, calendar_id: UUID, user_id: UUID) -> Calendar:
    statement = (
      self.get_base_statement()
      .join(CalendarAccount, Calendar.account_id == CalendarAccount.id)
      .where(Calendar.id == calendar_id, CalendarAccount.user_id == user_id)
    )
    calendar = await self.get_one_or_none(statement)
    if calendar is None:
      raise ResourceNotFound("Calendar not found")
    return calendar

  async def get_owned_with_account(self, calendar_id: UUID, user_id: UUID) -> tuple[Calendar, CalendarAccount]:
    statement = (
      select(Calendar, CalendarAccount)
      .join(CalendarAccount, Calendar.account_id == CalendarAccount.id)
      .where(Calendar.id == calendar_id, CalendarAccount.user_id == user_id)
    )
    row = (await self.session.execute(statement)).one_or_none()
    if row is None:
      raise ResourceNotFound("Calendar not found")
    return row[0], row[1]

  async def list_for_account(self, account: CalendarAccount) -> Sequence[Calendar]:
    return await self.get_all(self.get_base_statement().where(Calendar.account_id == account.id).order_by(Calendar.created_at))

  async def get_with_account(self, calendar_id: UUID) -> tuple[Calendar, CalendarAccount] | None:
    statement = select(Calendar, CalendarAccount).join(CalendarAccount, Calendar.account_id == CalendarAccount.id).where(Calendar.id == calendar_id)
    row = (await self.session.execute(statement)).one_or_none()
    return (row[0], row[1]) if row is not None else None

  async def get_by_push_channel(self, channel_id: str) -> Calendar | None:
    return await self.get_one_or_none(self.get_base_statement().where(Calendar.push_channel_id == channel_id))

  async def sync_for_account(self, account: CalendarAccount, calendars: Sequence[ProviderCalendar]) -> dict[str, Calendar]:
    """Mirror the provider's calendar list. `hidden` is only seeded on insert so
    the user's visibility choice survives every later sync."""
    if calendars:
      statement = insert(Calendar).values(
        [
          {
            "id": generate_uuid(),
            "created_at": utc_now(),
            "account_id": account.id,
            "external_id": c.external_id,
            "name": c.name,
            "color": c.color,
            "hidden": c.hidden_by_default,
            "writable": c.writable,
            "primary": c.primary,
            "change_tag": c.change_tag,
          }
          for c in {c.external_id: c for c in calendars}.values()
        ]
      )
      statement = statement.on_conflict_do_update(
        constraint="calendars_account_id_external_id_key",
        set_={
          "name": statement.excluded.name,
          "color": statement.excluded.color,
          "writable": statement.excluded.writable,
          "primary": statement.excluded.primary,
          "change_tag": statement.excluded.change_tag,
          "modified_at": utc_now(),
        },
      )
      await self.session.execute(statement)

    await self.session.execute(
      delete(Calendar).where(
        Calendar.account_id == account.id,
        Calendar.external_id.not_in([c.external_id for c in calendars]),
      )
    )
    result = await self.session.execute(self.get_base_statement().where(Calendar.account_id == account.id).execution_options(populate_existing=True))
    return {c.external_id: c for c in result.scalars().all()}


class CalendarEventRepository(RepositoryBase[CalendarEvent]):
  model = CalendarEvent

  async def replace_for_calendar(self, calendar: Calendar, events: Sequence[ProviderEvent]) -> None:
    """Upsert the provider's events and drop any this calendar no longer has."""
    rows: list[dict[str, Any]] = [
      {
        "id": generate_uuid(),
        "created_at": utc_now(),
        "calendar_id": calendar.id,
        "external_id": e.external_id,
        "title": e.title[:1024],
        "location": e.location[:1024] if e.location else None,
        "all_day": e.all_day,
        "start_at": e.start_at,
        "end_at": e.end_at,
        "start_date": e.start_date,
        "end_date": e.end_date,
        "description": e.description,
        "creator_name": e.creator_name[:255] if e.creator_name else None,
        "creator_email": e.creator_email[:320] if e.creator_email else None,
        "attendees": [{"email": a.email, "name": a.name, "response": a.response, "is_self": a.is_self, "is_organizer": a.is_organizer} for a in e.attendees],
        "my_response": e.my_response,
        "conference_url": e.conference_url if e.conference_url and len(e.conference_url) <= 2048 else None,
        "html_link": e.html_link if e.html_link and len(e.html_link) <= 2048 else None,
        "busy": e.busy,
        "recurring": e.recurring,
        "visibility": e.visibility,
        "editable": e.editable,
        "series_id": e.series_id,
        "original_start": e.original_start,
        "rrule": e.rrule,
        "etag": e.etag,
        "resource_href": e.resource_href,
        "color_id": e.color_id,
      }
      for e in {e.external_id: e for e in events}.values()
    ]
    for i in range(0, len(rows), UPSERT_BATCH_SIZE):
      statement = insert(CalendarEvent).values(rows[i : i + UPSERT_BATCH_SIZE])
      statement = statement.on_conflict_do_update(
        constraint="calendar_events_calendar_id_external_id_key",
        set_={
          **{column: statement.excluded[column] for column in _EVENT_SYNC_COLUMNS},
          "modified_at": utc_now(),
        },
      )
      await self.session.execute(statement)

    await self.session.execute(
      delete(CalendarEvent).where(
        CalendarEvent.calendar_id == calendar.id,
        CalendarEvent.external_id.not_in([row["external_id"] for row in rows]),
      )
    )

  async def get_owned_with_context(self, event_id: UUID, user_id: UUID) -> tuple[CalendarEvent, Calendar, CalendarAccount]:
    statement = (
      select(CalendarEvent, Calendar, CalendarAccount)
      .join(Calendar, CalendarEvent.calendar_id == Calendar.id)
      .join(CalendarAccount, Calendar.account_id == CalendarAccount.id)
      .where(CalendarEvent.id == event_id, CalendarAccount.user_id == user_id)
    )
    row = (await self.session.execute(statement)).one_or_none()
    if row is None:
      raise ResourceNotFound("Event not found")
    return row[0], row[1], row[2]

  async def find_written(self, calendar_id: UUID, provider_id: str, near: datetime | date | None) -> CalendarEvent | None:
    """The synced row for an event or series the provider just wrote, closest to `near`."""
    statement = (
      self.get_base_statement()
      .where(
        CalendarEvent.calendar_id == calendar_id,
        or_(CalendarEvent.external_id == provider_id, CalendarEvent.series_id == provider_id),
      )
      # The rows were just rewritten by a bulk upsert; don't serve stale objects
      # this session loaded before the write.
      .execution_options(populate_existing=True)
    )
    rows = list(await self.get_all(statement))
    if not rows or near is None:
      return rows[0] if rows else None
    target = _as_utc(near)
    return min(rows, key=lambda row: abs((_as_utc(row.start_at or row.start_date) - target).total_seconds()))

  async def list_in_range(self, user_id: UUID, start: datetime, end: datetime, *, visible_only: bool = False) -> Sequence[CalendarEvent]:
    # All-day spans are calendar dates with no zone; pad a day each side and
    # let the client place them in its own local days.
    start_day = (start - timedelta(days=1)).date()
    end_day = (end + timedelta(days=1)).date()
    statement = (
      self.get_base_statement()
      .join(Calendar, CalendarEvent.calendar_id == Calendar.id)
      .join(CalendarAccount, Calendar.account_id == CalendarAccount.id)
      .where(
        CalendarAccount.user_id == user_id,
        or_(
          and_(CalendarEvent.all_day.is_(False), CalendarEvent.start_at < end, CalendarEvent.end_at > start),
          and_(CalendarEvent.all_day.is_(True), CalendarEvent.start_date < end_day, CalendarEvent.end_date > start_day),
        ),
      )
      # A total order: events starting together (all-day ones on the same day
      # above all) would otherwise come back in whatever order the plan gives.
      .order_by(
        CalendarEvent.start_at,
        CalendarEvent.start_date,
        CalendarEvent.end_at.desc(),
        CalendarEvent.end_date.desc(),
        CalendarEvent.title,
        CalendarEvent.id,
      )
    )
    if visible_only:
      statement = statement.where(Calendar.hidden.is_(False))
    return await self.get_all(statement)

  async def emails_for_account(self, account: CalendarAccount) -> set[str]:
    """Every guest and organizer address on the account's synced events, lowercased."""
    on_account = select(Calendar.id).where(Calendar.account_id == account.id).scalar_subquery()
    attendee = func.jsonb_array_elements(CalendarEvent.attendees).table_valued("value").alias("attendee")
    guests = (
      select(func.lower(attendee.c.value.op("->>")(literal_column("'email'"))).label("email"))
      .select_from(CalendarEvent)
      .join(attendee, literal_column("true"))
      .where(CalendarEvent.calendar_id.in_(on_account))
    )
    creators = select(func.lower(CalendarEvent.creator_email).label("email")).where(
      CalendarEvent.calendar_id.in_(on_account), CalendarEvent.creator_email.is_not(None)
    )
    result = await self.session.execute(union(guests, creators))
    return {email for email in result.scalars().all() if email}


class CalendarPersonRepository(RepositoryBase[CalendarPerson]):
  model = CalendarPerson

  async def replace_for_account(self, account: CalendarAccount, people: Sequence[ProviderPerson]) -> None:
    await self.session.execute(delete(CalendarPerson).where(CalendarPerson.account_id == account.id))
    unique = {p.email: p for p in people if p.name or p.photo_url}
    if unique:
      await self.session.execute(
        insert(CalendarPerson).values(
          [
            {"id": generate_uuid(), "created_at": utc_now(), "account_id": account.id, "email": p.email, "name": p.name, "photo_url": p.photo_url}
            for p in unique.values()
          ]
        )
      )

  async def lookup_for_user(self, user_id: UUID, emails: set[str]) -> dict[str, CalendarPerson]:
    """Names and photos the user's own accounts have for these addresses
    (lowercased); with several, the oldest account wins."""
    if not emails:
      return {}
    statement = (
      self.get_base_statement()
      .join(CalendarAccount, CalendarPerson.account_id == CalendarAccount.id)
      .where(CalendarAccount.user_id == user_id, CalendarPerson.email.in_(emails))
      .order_by(CalendarAccount.created_at.desc())
    )
    return {person.email: person for person in await self.get_all(statement)}


def _as_utc(value: datetime | date | None) -> datetime:
  if isinstance(value, datetime):
    return value.astimezone(UTC)
  if isinstance(value, date):
    return datetime(value.year, value.month, value.day, tzinfo=UTC)
  return datetime.min.replace(tzinfo=UTC)
