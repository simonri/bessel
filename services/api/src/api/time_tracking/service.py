from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from api.common.db.postgres import AsyncSession
from api.common.utils import utc_now
from api.exceptions import ValidationError
from api.models.time_tracking import TimeEntry, TimeProject
from api.time_tracking.repository import TimeEntryRepository, TimeProjectRepository
from api.time_tracking.schemas import TimeEntryCreate, TimeEntryUpdate, TimeMonthTotal, TimeProjectUpdate

MAX_ENTRY = timedelta(hours=24)
MAX_RANGE = timedelta(days=62)


def _month_start(year: int, month: int, tz: ZoneInfo) -> datetime:
  if month == 13:
    year, month = year + 1, 1
  return datetime(year, month, 1, tzinfo=tz)


def month_totals(entries: Sequence[TimeEntry], year: int, tz: ZoneInfo) -> list[TimeMonthTotal]:
  """Seconds per project per local month, splitting entries that cross a month."""
  seconds: dict[tuple[UUID, int], float] = defaultdict(float)
  bounds = [_month_start(year, m, tz) for m in range(1, 14)]
  for entry in entries:
    for month in range(1, 13):
      overlap = min(entry.end_ts, bounds[month]) - max(entry.start_ts, bounds[month - 1])
      if overlap > timedelta(0):
        seconds[entry.time_project_id, month] += overlap.total_seconds()
  return [TimeMonthTotal(time_project_id=pid, month=month, seconds=round(secs)) for (pid, month), secs in sorted(seconds.items(), key=lambda kv: kv[0][1])]


class TimeTrackingService:
  async def update_project(self, session: AsyncSession, project: TimeProject, body: TimeProjectUpdate) -> TimeProject:
    changes: dict[str, Any] = body.model_dump(exclude_unset=True, exclude={"archived"})
    if body.archived is not None:
      changes["archived_at"] = (project.archived_at or utc_now()) if body.archived else None
    return await TimeProjectRepository.from_session(session).update(project, update_dict=changes, flush=True)

  async def create_entry(self, session: AsyncSession, user_id: UUID, body: TimeEntryCreate) -> TimeEntry:
    await self._owned_project(session, body.time_project_id, user_id)
    _check_span(body.start_ts, body.end_ts)
    entry = TimeEntry(user_id=user_id, time_project_id=body.time_project_id, start_ts=body.start_ts, end_ts=body.end_ts, note=body.note or None)
    return await TimeEntryRepository.from_session(session).create(entry, flush=True)

  async def update_entry(self, session: AsyncSession, entry: TimeEntry, body: TimeEntryUpdate) -> TimeEntry:
    changes: dict[str, Any] = body.model_dump(exclude_unset=True)
    if body.time_project_id is not None:
      await self._owned_project(session, body.time_project_id, entry.user_id)
    _check_span(changes.get("start_ts", entry.start_ts), changes.get("end_ts", entry.end_ts))
    if "note" in changes:
      changes["note"] = changes["note"] or None
    return await TimeEntryRepository.from_session(session).update(entry, update_dict=changes, flush=True)

  async def list_entries(self, session: AsyncSession, user_id: UUID, start: datetime, end: datetime) -> Sequence[TimeEntry]:
    if end <= start or end - start > MAX_RANGE:
      raise ValidationError("Pick a range of up to two months.", status_code=422)
    return await TimeEntryRepository.from_session(session).list_overlapping(user_id, start, end)

  async def summary(self, session: AsyncSession, user_id: UUID, year: int, tz: ZoneInfo) -> list[TimeMonthTotal]:
    entries = await TimeEntryRepository.from_session(session).list_overlapping(user_id, _month_start(year, 1, tz), _month_start(year, 13, tz))
    return month_totals(entries, year, tz)

  async def _owned_project(self, session: AsyncSession, project_id: UUID, user_id: UUID) -> TimeProject:
    return await TimeProjectRepository.from_session(session).get_owned_or_404(project_id, user_id, not_found_message="Project not found.")


def _check_span(start: datetime, end: datetime) -> None:
  if start.tzinfo is None or end.tzinfo is None:
    raise ValidationError("Times need a timezone.", status_code=422)
  if end <= start:
    raise ValidationError("An entry has to end after it starts.", status_code=422)
  if end - start > MAX_ENTRY:
    raise ValidationError("An entry can be at most 24 hours.", status_code=422)
