from datetime import date, datetime, time, timedelta
from typing import Annotated
from uuid import UUID

from mcp.server.mcpserver import Context
from pydantic import Field

from api.common.schemas import Schema
from api.gym.repository import GymTopSetRepository
from api.healthkit.repository import HealthKitDailyMetricRepository, HealthKitSleepSampleRepository, HealthKitWorkoutRepository
from api.healthkit.schemas import SleepDailyEntry, SleepStageSummary
from api.healthkit.service import healthkit_sleep_service
from api.mcp.context import user_session
from api.mcp.dates import Day, TimezoneParam, local_window, parse_day, resolve_timezone, today_in
from api.mcp.tools.common import ToolSpec, read

MAX_SLEEP_DAYS = 92
MAX_DAILY_DAYS = 92
MAX_GYM_DAYS = 366


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
    # A night belongs to the day it ended on; these two local noons select
    # the nights ending on start_day..end_day (see healthkit_sleep_service).
    start_ts = int(datetime.combine(start_day - timedelta(days=1), time(12), tzinfo=tz).timestamp())
    end_ts = int(datetime.combine(end_day, time(12), tzinfo=tz).timestamp())
    repo = HealthKitSleepSampleRepository.from_session(session)
    nights = await healthkit_sleep_service.nightly_totals(repo, user.id, start_ts, end_ts, tz, 0)
    summary = await healthkit_sleep_service.stage_summary(repo, user.id, start_ts, end_ts, tz)
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


class HealthDay(Schema):
  date: date
  steps: int | None
  active_energy_kcal: float | None
  exercise_minutes: float | None
  resting_heart_rate: float | None = Field(description="Beats per minute.")
  hrv_ms: float | None = Field(description="Heart rate variability in milliseconds.")


class DailyHealth(Schema):
  days: list[HealthDay] = Field(description="Oldest first. A day the phone sent nothing for is missing.")


async def get_daily_health(ctx: Context, start: Day = "7 days ago", end: Day = "today", timezone: TimezoneParam = None) -> DailyHealth:
  """Daily totals from Apple Health: steps, active energy, exercise minutes, resting heart rate and HRV.

  Steps show walks that were never started as a workout, e.g. "did I move enough today".
  """
  async with user_session(ctx) as (session, user):
    tz = resolve_timezone(user, timezone)
    today = today_in(tz)
    start_day, end_day = parse_day(start, today), parse_day(end, today)
    local_window(start_day, end_day, tz, max_days=MAX_DAILY_DAYS)
    rows = await HealthKitDailyMetricRepository.from_session(session).list_between(user.id, start_day, end_day)
  return DailyHealth(
    days=[
      HealthDay(
        date=row.date,
        steps=row.steps,
        active_energy_kcal=row.active_energy_kcal,
        exercise_minutes=row.exercise_minutes,
        resting_heart_rate=row.resting_heart_rate,
        hrv_ms=row.hrv_ms,
      )
      for row in rows
    ]
  )


class GymSet(Schema):
  exercise: str
  muscles: list[str] = Field(description="Muscle groups it works, e.g. chest, triceps.")
  weight_kg: float = Field(description="The heaviest set of the day. Reps aren't logged.")
  previous_kg: float | None = Field(description="This exercise's top set the time before, to see progress; null the first time.")


class GymDay(Schema):
  date: date
  sets: list[GymSet]


class GymLog(Schema):
  days: list[GymDay] = Field(description="Days with logged lifts, newest first.")


async def get_gym_log(ctx: Context, start: Day = "30 days ago", end: Day = "today", timezone: TimezoneParam = None) -> GymLog:
  """Lifts the user logged in the Bessel app: per day, each exercise's heaviest set in kg and the one before it.

  Use it to see which session was done (e.g. push or pull from the exercises) and whether the weights are going up.
  Apple Health workouts only say "strength training"; this is what was lifted.
  """
  async with user_session(ctx) as (session, user):
    tz = resolve_timezone(user, timezone)
    today = today_in(tz)
    start_day, end_day = parse_day(start, today), parse_day(end, today)
    local_window(start_day, end_day, tz, max_days=MAX_GYM_DAYS)
    repo = GymTopSetRepository.from_session(session)
    rows = await repo.list_between(user.id, start_day, end_day)
    previous = {top.exercise_id: float(top.weight_kg) for top in await repo.latest_before(user.id, start_day)}

  days: dict[date, list[GymSet]] = {}
  for top, exercise in rows:
    days.setdefault(top.performed_on, []).append(
      GymSet(exercise=exercise.name, muscles=exercise.muscles, weight_kg=float(top.weight_kg), previous_kg=previous.get(exercise.id))
    )
    previous[exercise.id] = float(top.weight_kg)
  return GymLog(days=[GymDay(date=day, sets=sets) for day, sets in sorted(days.items(), reverse=True)])


TOOLS: list[ToolSpec] = [
  read(get_sleep, "Sleep"),
  read(list_workouts, "Workouts"),
  read(get_daily_health, "Daily health"),
  read(get_gym_log, "Gym log"),
]
