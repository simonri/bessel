"""The user's own base rates and lagged effects across sleep, activity, workouts and tasks.

A night is keyed by the local day the user woke up (D, as in the sleep service) and
belongs to the evening before (D-1): that day's steps, gym session and late work are
compared with the onset of the sleep that followed.
"""

import bisect
import statistics
from collections import Counter
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from api.activity.repository import ActivityRepository
from api.activity.service import ActivityService
from api.gym.repository import GymTopSetRepository
from api.healthkit.repository import HealthKitDailyMetricRepository, HealthKitSleepSampleRepository, HealthKitWorkoutRepository
from api.healthkit.scores import minutes_of_day
from api.healthkit.service import healthkit_sleep_service
from api.models.healthkit_workout import HealthKitWorkout
from api.models.task import Task
from api.patterns.schemas import ComputerOff, Effect, Patterns, PatternWindow, ProjectOnTime, SleepPatterns, TaskPatterns, WeekdayCompletions, WeekdayOnset
from api.postgres import AsyncSession
from api.tasks.repository import TaskRepository
from api.tasks.schemas import TaskStatus

MIN_SAMPLES = 5
RECENT_NIGHTS = 14
RECENT_EFFECT_DAYS = 30
SHORT_NIGHT_SECS = 6 * 3600
STEPS_THRESHOLD = 6000
LATE_TASK_HOUR = 23
WORKOUT_BEFORE_ONSET = timedelta(hours=3)
# The computer is "off for the night" at the end of the last use overlapping these hours.
EVENING_HOUR = 18
NIGHT_END_HOUR = 6
# Clock times are measured from these hours so that a night's times don't wrap at midnight.
ONSET_ANCHOR_HOUR = 12
WAKE_ANCHOR_HOUR = 18
WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


def clock_minutes(moment: datetime, anchor_hour: int = ONSET_ANCHOR_HOUR) -> float:
  """Minutes since the last `anchor_hour` on the local clock, so 23:30 < 00:30 when anchored at noon."""
  return (minutes_of_day(moment) - anchor_hour * 60) % 1440


def format_clock(minutes: float, anchor_hour: int = ONSET_ANCHOR_HOUR) -> str:
  total = round(minutes + anchor_hour * 60) % 1440
  return f"{total // 60:02d}:{total % 60:02d}"


@dataclass(frozen=True)
class Night:
  wake_date: date
  onset: datetime
  wake: datetime
  asleep_secs: int


@dataclass(frozen=True)
class Sample:
  day: date
  value: float


@dataclass(frozen=True)
class PatternData:
  start: date
  end: date
  tz: ZoneInfo
  nights: dict[date, Night]
  steps: dict[date, int]
  strength_days: set[date]
  workouts: Sequence[HealthKitWorkout]
  completed: Sequence[Task]
  due: Sequence[Task]
  overdue: int
  periods: list[tuple[int, int]]
  activity_days: set[date]


def _local(day: date, hour: int, tz: ZoneInfo) -> datetime:
  return datetime.combine(day, time(hour), tzinfo=tz)


def _median_clock(values: Sequence[float], anchor_hour: int = ONSET_ANCHOR_HOUR) -> str | None:
  return format_clock(statistics.median(values), anchor_hour) if values else None


class PatternsService:
  async def build(self, session: AsyncSession, user_id: UUID, tz: ZoneInfo, today: date, days: int) -> Patterns:
    return compute_patterns(await self.load(session, user_id, tz, today, days))

  async def load(self, session: AsyncSession, user_id: UUID, tz: ZoneInfo, today: date, days: int) -> PatternData:
    start, end = today - timedelta(days=days - 1), today
    first_day = start - timedelta(days=1)
    since, until = _local(first_day, 0, tz), _local(end + timedelta(days=1), 0, tz)

    entries = await healthkit_sleep_service.nightly_totals(
      HealthKitSleepSampleRepository.from_session(session),
      user_id,
      int(_local(first_day, 12, tz).timestamp()),
      int(_local(end, 12, tz).timestamp()),
      tz,
      0,
    )
    nights = {
      date.fromisoformat(entry.date): Night(
        wake_date=date.fromisoformat(entry.date),
        onset=datetime.fromisoformat(entry.sleep_onset),
        wake=datetime.fromisoformat(entry.wake_time),
        asleep_secs=entry.asleep_secs,
      )
      for entry in entries
      if entry.sleep_onset is not None and entry.wake_time is not None
    }

    metrics = await HealthKitDailyMetricRepository.from_session(session).list_between(user_id, first_day, end)
    gym_days = {top.performed_on for top, _ in await GymTopSetRepository.from_session(session).list_between(user_id, first_day, end)}
    workouts = await HealthKitWorkoutRepository.from_session(session).list_started_between(user_id, since, until)
    strength_days = gym_days | {w.start_date.astimezone(tz).date() for w in workouts if "strength" in w.workout_activity_type_name.lower()}

    task_repo = TaskRepository.from_session(session)
    completed = await task_repo.get_all(task_repo.get_filtered_statement(user_id, statuses=[TaskStatus.done], completed_after=since, completed_before=until))
    due = await task_repo.get_all(task_repo.get_filtered_statement(user_id, due_from=start, due_to=end))
    overdue = await task_repo.get_all(
      task_repo.get_filtered_statement(user_id, statuses=[TaskStatus.todo], due_to=today - timedelta(days=1), is_recurring=False)
    )

    periods, activity_days = await self._activity(ActivityRepository.from_session(session), user_id, tz, since, until)
    return PatternData(
      start=start,
      end=end,
      tz=tz,
      nights=nights,
      steps={m.date: m.steps for m in metrics if m.steps is not None},
      strength_days=strength_days,
      workouts=workouts,
      completed=completed,
      due=[t for t in due if t.status != TaskStatus.cancelled],
      overdue=len(overdue),
      periods=periods,
      activity_days=activity_days,
    )

  async def _activity(self, repo: ActivityRepository, user_id: UUID, tz: ZoneInfo, since: datetime, until: datetime) -> tuple[list[tuple[int, int]], set[date]]:
    """Periods of computer use across every computer, and the local days with any use."""
    service = ActivityService()
    segments = []
    for source in await repo.get_sources(user_id):
      segments.extend(await service.get_active_segments(repo, user_id, source, int(since.timestamp()), int(until.timestamp())))
    segments.sort(key=lambda s: s.start_ts)
    days = {datetime.fromtimestamp(s.start_ts, tz).date() for s in segments}
    return service.active_periods(segments), days


def compute_patterns(data: PatternData) -> Patterns:
  window_days = [data.start + timedelta(days=i) for i in range((data.end - data.start).days + 1)]
  nights = [data.nights[d] for d in window_days if d in data.nights]
  notes: list[str] = []

  if not nights:
    notes.append("No sleep recorded in the window.")
  elif len(nights) < len(window_days):
    notes.append(f"Sleep missing {len(window_days) - len(nights)} of {len(window_days)} nights.")

  sleep = _sleep(data, nights, notes)
  computer_off = _computer_off(data, window_days, nights, notes)
  effects = _effects(data, nights, notes)
  tasks = _tasks(data, window_days)

  steps_known = sum(1 for d in window_days if d - timedelta(days=1) in data.steps)
  if steps_known < len(window_days):
    notes.append(f"Steps missing for {len(window_days) - steps_known} of {len(window_days)} days.")
  if not data.strength_days:
    notes.append("No gym logs or strength workouts in the window.")

  return Patterns(
    window=PatternWindow(
      start=data.start,
      end=data.end,
      nights=len(window_days),
      nights_with_sleep=len(nights),
      days_with_activity=sum(1 for d in window_days if d in data.activity_days),
    ),
    sleep=sleep,
    computer_off=computer_off,
    effects=effects,
    tasks=tasks,
    notes=notes,
  )


def _sleep(data: PatternData, nights: list[Night], notes: list[str]) -> SleepPatterns:
  onsets = [clock_minutes(n.onset) for n in nights]
  by_weekday: dict[int, list[float]] = {}
  for night, onset in zip(nights, onsets, strict=True):
    by_weekday.setdefault((night.wake_date - timedelta(days=1)).weekday(), []).append(onset)

  iqr = None
  if len(onsets) >= MIN_SAMPLES:
    q1, _, q3 = statistics.quantiles(onsets, n=4, method="inclusive")
    iqr = round(q3 - q1)

  recent_from = data.end - timedelta(days=RECENT_NIGHTS - 1)
  recent = [o for n, o in zip(nights, onsets, strict=True) if n.wake_date >= recent_from]
  earlier = [o for n, o in zip(nights, onsets, strict=True) if n.wake_date < recent_from]
  shift = None
  if len(recent) >= MIN_SAMPLES and len(earlier) >= MIN_SAMPLES:
    shift = round(statistics.median(recent) - statistics.median(earlier))
  elif nights:
    notes.append(f"Too few nights to compare the last {RECENT_NIGHTS} with the ones before ({len(recent)} vs {len(earlier)}).")

  return SleepPatterns(
    median_onset=_median_clock(onsets),
    median_wake=_median_clock([clock_minutes(n.wake, WAKE_ANCHOR_HOUR) for n in nights], WAKE_ANCHOR_HOUR),
    onset_iqr_minutes=iqr,
    median_asleep_hours=round(statistics.median(n.asleep_secs for n in nights) / 3600, 2) if nights else None,
    by_weekday=[
      WeekdayOnset(night_of=WEEKDAYS[weekday], median_onset=format_clock(statistics.median(values)), nights=len(values))
      for weekday, values in sorted(by_weekday.items())
    ],
    recent_median_onset=_median_clock(recent),
    earlier_median_onset=_median_clock(earlier),
    recent_shift_minutes=shift,
  )


def computer_off_at(periods: list[tuple[int, int]], starts: list[int], wake_date: date, tz: ZoneInfo) -> int | None:
  """End of the last period of use overlapping the evening before `wake_date` to early that morning."""
  window_start = int(_local(wake_date - timedelta(days=1), EVENING_HOUR, tz).timestamp())
  window_end = int(_local(wake_date, NIGHT_END_HOUR, tz).timestamp())
  index = bisect.bisect_left(starts, window_end) - 1
  if index < 0 or periods[index][1] <= window_start:
    return None
  return periods[index][1]


def _computer_off(data: PatternData, window_days: list[date], nights: list[Night], notes: list[str]) -> ComputerOff:
  starts = [p[0] for p in data.periods]
  off = {d: ts for d in window_days if (ts := computer_off_at(data.periods, starts, d, data.tz)) is not None}
  if not off:
    notes.append("No evening computer activity recorded in the window.")
  elif len(off) < len(window_days):
    notes.append(f"Computer-off time known for {len(off)} of {len(window_days)} nights.")

  both = [(off[n.wake_date], n) for n in nights if n.wake_date in off]
  off_clock = [clock_minutes(datetime.fromtimestamp(ts, data.tz)) for ts in off.values()]
  slope = r = None
  xs = [clock_minutes(datetime.fromtimestamp(ts, data.tz)) for ts, _ in both]
  ys = [clock_minutes(n.onset) for _, n in both]
  if len(both) >= MIN_SAMPLES and len(set(xs)) > 1 and len(set(ys)) > 1:
    slope = round(statistics.linear_regression(xs, ys).slope * 60, 1)
    r = round(statistics.correlation(xs, ys), 2)
  return ComputerOff(
    median_off=_median_clock(off_clock),
    nights=len(off),
    median_gap_minutes=round(statistics.median((n.onset.timestamp() - ts) / 60 for ts, n in both)) if both else None,
    nights_with_both=len(both),
    onset_minutes_per_hour_later=slope,
    r=r,
  )


@dataclass(frozen=True)
class EffectSpec:
  name: str
  with_label: str
  without_label: str
  unit: Literal["minutes", "tasks"]


def _sign(value: float) -> int:
  return (value > 0) - (value < 0)


def _effect(spec: EffectSpec, with_: list[Sample], without: list[Sample], window_start: date, recent_from: date, notes: list[str]) -> Effect | None:
  if len(with_) < MIN_SAMPLES or len(without) < MIN_SAMPLES:
    notes.append(f"Not enough data for {spec.name} ({len(with_)} vs {len(without)}; needs {MIN_SAMPLES} each).")
    return None
  aggregate: Callable[[Sequence[float]], float] = statistics.median if spec.unit == "minutes" else statistics.fmean
  a, b = aggregate([s.value for s in with_]), aggregate([s.value for s in without])
  difference = a - b

  recent_with = [s.value for s in with_ if s.day >= recent_from]
  recent_without = [s.value for s in without if s.day >= recent_from]
  holds_recently = None
  if window_start < recent_from and len(recent_with) >= MIN_SAMPLES and len(recent_without) >= MIN_SAMPLES:
    holds_recently = _sign(aggregate(recent_with) - aggregate(recent_without)) == _sign(difference)

  if spec.unit == "minutes":
    difference = round(difference)
    direction = f"{abs(difference)} min {'later' if difference > 0 else 'earlier'}" if difference else "no different"
    comparison = f"median {format_clock(a)} vs {format_clock(b)}, {len(with_)} vs {len(without)} nights"
    description = f"{spec.with_label}, sleep onset was {direction} than {spec.without_label} ({comparison})."
  else:
    difference = round(difference, 2)
    description = f"{spec.with_label}, {a:.1f} tasks were completed on average vs {b:.1f} {spec.without_label} ({len(with_)} vs {len(without)} days)."
  return Effect(
    name=spec.name,
    description=description,
    n_with=len(with_),
    n_without=len(without),
    difference=difference,
    unit=spec.unit,
    holds_recently=holds_recently,
  )


def _split(nights: list[Night], has: Callable[[Night], bool | None]) -> tuple[list[Sample], list[Sample]]:
  """Each night's onset, split by `has`; a night `has` returns None for is left out."""
  with_: list[Sample] = []
  without: list[Sample] = []
  for night in nights:
    flag = has(night)
    if flag is None:
      continue
    (with_ if flag else without).append(Sample(night.wake_date, clock_minutes(night.onset)))
  return with_, without


def _effects(data: PatternData, nights: list[Night], notes: list[str]) -> list[Effect]:
  if not nights:
    return []
  tz = data.tz
  recent_from = data.end - timedelta(days=RECENT_EFFECT_DAYS - 1)
  completed_ts = sorted(t.completed_at.timestamp() for t in data.completed if t.completed_at is not None)
  completions_per_day = Counter(t.completed_at.astimezone(tz).date() for t in data.completed if t.completed_at is not None)
  workout_ends = sorted(w.end_date.timestamp() for w in data.workouts)

  def any_between(timestamps: list[float], lo: float, hi: float) -> bool:
    index = bisect.bisect_left(timestamps, lo)
    return index < len(timestamps) and timestamps[index] <= hi

  def evening(night: Night) -> date:
    return night.wake_date - timedelta(days=1)

  def steps_high(night: Night) -> bool | None:
    steps = data.steps.get(evening(night))
    return None if steps is None else steps >= STEPS_THRESHOLD

  def late_task(night: Night) -> bool:
    late_start = _local(evening(night), LATE_TASK_HOUR, tz).timestamp()
    return any_between(completed_ts, late_start, min(night.onset.timestamp(), _local(night.wake_date, NIGHT_END_HOUR, tz).timestamp()))

  candidates = [
    (EffectSpec("gym_day", "After a gym or strength-training day", "after other days", "minutes"), _split(nights, lambda n: evening(n) in data.strength_days)),
    (
      EffectSpec("workout_within_3h_of_sleep", "When a workout ended within 3 h of falling asleep", "on other nights", "minutes"),
      _split(nights, lambda n: any_between(workout_ends, (n.onset - WORKOUT_BEFORE_ONSET).timestamp(), n.onset.timestamp())),
    ),
    (EffectSpec("steps_6000", f"After days with {STEPS_THRESHOLD}+ steps", f"after days under {STEPS_THRESHOLD}", "minutes"), _split(nights, steps_high)),
    (EffectSpec("late_task_completion", f"On nights with a task completed after {LATE_TASK_HOUR}:00", "on other nights", "minutes"), _split(nights, late_task)),
  ]

  complete_days = [n for n in nights if n.wake_date < data.end]
  short_with = [Sample(n.wake_date, completions_per_day[n.wake_date]) for n in complete_days if n.asleep_secs < SHORT_NIGHT_SECS]
  short_without = [Sample(n.wake_date, completions_per_day[n.wake_date]) for n in complete_days if n.asleep_secs >= SHORT_NIGHT_SECS]
  candidates.append((EffectSpec("short_night_next_day_tasks", "After a night under 6 h asleep", "after longer nights", "tasks"), (short_with, short_without)))

  effects = []
  for spec, (with_, without) in candidates:
    if (effect := _effect(spec, with_, without, data.start, recent_from, notes)) is not None:
      effects.append(effect)
  return effects


def _tasks(data: PatternData, window_days: list[date]) -> TaskPatterns:
  tz = data.tz

  def done_on_time(task: Task) -> bool:
    return task.status == TaskStatus.done and task.completed_at is not None and task.completed_at.astimezone(tz).date() <= task.due_date

  settled = [t for t in data.due if t.due_date is not None and (t.due_date < data.end or t.status == TaskStatus.done)]
  by_project: dict[str | None, list[Task]] = {}
  for task in settled:
    by_project.setdefault(task.project_obj.name if task.project_obj is not None else None, []).append(task)
  on_time = sum(1 for t in settled if done_on_time(t))

  per_day = Counter(t.completed_at.astimezone(tz).date() for t in data.completed if t.completed_at is not None)
  by_weekday: dict[int, list[int]] = {}
  for day in window_days:
    if day < data.end:
      by_weekday.setdefault(day.weekday(), []).append(per_day[day])

  return TaskPatterns(
    due=len(settled),
    on_time=on_time,
    on_time_rate=round(on_time / len(settled), 2) if settled else None,
    by_project=[
      ProjectOnTime(project=name, due=len(tasks), on_time=(hits := sum(1 for t in tasks if done_on_time(t))), rate=round(hits / len(tasks), 2))
      for name, tasks in sorted(by_project.items(), key=lambda item: -len(item[1]))
    ],
    completions_by_weekday=[
      WeekdayCompletions(weekday=WEEKDAYS[weekday], median_completed=statistics.median(counts), days=len(counts))
      for weekday, counts in sorted(by_weekday.items())
    ],
    overdue=data.overdue,
  )


patterns_service = PatternsService()
