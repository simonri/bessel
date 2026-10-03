from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import selectinload

from api.calendars.providers import ProviderCalendar, ProviderEvent
from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.common.utils import generate_uuid, utc_now
from api.exceptions import ResourceNotFound
from api.models.calendar import Calendar
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.calendar_event import CalendarEvent

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
  "conference_url",
  "html_link",
  "busy",
  "recurring",
  "visibility",
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

  async def list_ids(self) -> list[UUID]:
    result = await self.session.execute(select(CalendarAccount.id))
    return list(result.scalars().all())


class CalendarRepository(RepositoryBase[Calendar]):
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
          }
          for c in {c.external_id: c for c in calendars}.values()
        ]
      )
      statement = statement.on_conflict_do_update(
        constraint="calendars_account_id_external_id_key",
        set_={"name": statement.excluded.name, "color": statement.excluded.color, "modified_at": utc_now()},
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
        "attendees": [{"email": a.email, "name": a.name, "response": a.response} for a in e.attendees],
        "conference_url": e.conference_url if e.conference_url and len(e.conference_url) <= 2048 else None,
        "html_link": e.html_link if e.html_link and len(e.html_link) <= 2048 else None,
        "busy": e.busy,
        "recurring": e.recurring,
        "visibility": e.visibility,
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

  async def list_in_range(self, user_id: UUID, start: datetime, end: datetime) -> Sequence[CalendarEvent]:
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
      .order_by(CalendarEvent.start_at, CalendarEvent.start_date)
    )
    return await self.get_all(statement)
