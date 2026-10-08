from datetime import datetime, time, timedelta
from typing import Annotated
from uuid import UUID

from mcp.server.mcpserver import Context
from pydantic import Field

from api.common.schemas import Schema
from api.healthkit.repository import HealthKitSleepSampleRepository, HealthKitWorkoutRepository
from api.healthkit.schemas import SleepDailyEntry, SleepStageSummary
from api.healthkit.service import healthkit_sleep_service
from api.mcp.context import user_session
from api.mcp.dates import Day, TimezoneParam, local_window, parse_day, resolve_timezone, today_in
from api.mcp.tools.common import ToolSpec, read

MAX_SLEEP_DAYS = 92


class Sleep(Schema):
  nights: list[SleepDailyEntry] = Field(description="One entry per night, keyed by the local date the user woke up.")
  total_asleep_secs: int
  stages: list[SleepStageSummary] = Field(description="Time per sleep stage across the whole range, largest first.")


class Workout(Schema):
  id: UUID
  type: str
  start: datetime
  end: datetime
  duration_secs: float
  energy_burned_kcal: float | None
  distance_m: float | None
  source: str


class Workouts(Schema):
  workouts: list[Workout] = Field(description="Newest first.")


async def get_sleep(ctx: Context, start: Day = "today", end: Day = "today", timezone: TimezoneParam = None) -> Sleep:
  """Sleep from Apple Health: time asleep per night plus a sleep-stage breakdown for the range.

  A night belongs to the local day the user woke up on, so "how did I sleep last night" is start=end="today".
  """
  async with user_session(ctx) as (session, user):
    tz = resolve_timezone(user, timezone)
    today = today_in(tz)
    start_day, end_day = parse_day(start, today), parse_day(end, today)
    local_window(start_day, end_day, tz, max_days=MAX_SLEEP_DAYS)
    # Nights run noon to noon (see healthkit_sleep_service), so the nights that
    # end on start_day..end_day span exactly these two local noons.
    start_ts = int(datetime.combine(start_day - timedelta(days=1), time(12), tzinfo=tz).timestamp())
    end_ts = int(datetime.combine(end_day, time(12), tzinfo=tz).timestamp())
    repo = HealthKitSleepSampleRepository.from_session(session)
    nights = await healthkit_sleep_service.nightly_totals(repo, user.id, start_ts, end_ts, tz, 0)
    summary = await healthkit_sleep_service.stage_summary(repo, user.id, start_ts, end_ts)
  return Sleep(nights=nights, total_asleep_secs=summary.total_asleep_secs, stages=summary.stages)


async def list_workouts(
  ctx: Context,
  start: Annotated[str | None, Field(description="Only workouts on or after this day (same formats as other day inputs).")] = None,
  end: Annotated[str | None, Field(description="Only workouts on or before this day.")] = None,
  timezone: TimezoneParam = None,
  limit: Annotated[int, Field(ge=1, le=100)] = 20,
) -> Workouts:
  """The user's workouts from Apple Health, newest first, e.g. "how many times did I run this month"."""
  async with user_session(ctx) as (session, user):
    since = until = None
    if start is not None or end is not None:
      tz = resolve_timezone(user, timezone)
      today = today_in(tz)
      if start is not None:
        since = datetime.combine(parse_day(start, today), time.min, tzinfo=tz)
      if end is not None:
        until = datetime.combine(parse_day(end, today) + timedelta(days=1), time.min, tzinfo=tz)
    repo = HealthKitWorkoutRepository.from_session(session)
    rows, _ = await repo.paginate(repo.get_list_statement(user.id, since=since, until=until), limit=limit, page=1)
  return Workouts(
    workouts=[
      Workout(
        id=w.id,
        type=w.workout_activity_type_name,
        start=w.start_date,
        end=w.end_date,
        duration_secs=w.duration,
        energy_burned_kcal=w.total_energy_burned,
        distance_m=w.total_distance,
        source=w.source_name,
      )
      for w in rows
    ]
  )


TOOLS: list[ToolSpec] = [
  read(get_sleep, "Sleep"),
  read(list_workouts, "Workouts"),
]
