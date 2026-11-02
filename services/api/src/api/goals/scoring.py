"""Scores goals from data already loaded: pure, so every rule is testable without a database."""

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta

from dateutil.relativedelta import relativedelta

from api.goals.schemas import GoalSchema, GoalScore, PeriodResult
from api.models.goal import GoalComparison, GoalMetric, GoalPeriod
from api.patterns.service import ONSET_ANCHOR_HOUR, WAKE_ANCHOR_HOUR, Night, clock_minutes

HISTORY = {GoalPeriod.week: 8, GoalPeriod.month: 6}
# How many finished periods the next rung is read from.
STEP_LOOKBACK = 4

UNITS = {
  GoalMetric.sleep_before: "nights",
  GoalMetric.wake_before: "mornings",
  GoalMetric.gym_sessions: "sessions",
  GoalMetric.tasks_completed: "tasks",
  GoalMetric.people_met: "days",
  GoalMetric.manual: "",
  GoalMetric.body_weight: "kg",
  GoalMetric.body_fat: "%",
}


@dataclass(frozen=True)
class Met:
  day: date
  tags: frozenset[str]


@dataclass
class ScoreData:
  today: date
  nights: dict[date, Night] = field(default_factory=dict)
  strength_days: set[date] = field(default_factory=set)
  # (local completion day, project id) of completed tasks.
  completed: list[tuple[date, object]] = field(default_factory=list)
  met: list[Met] = field(default_factory=list)
  # (owner, currency) -> net worth in minor units.
  net_worth: dict[tuple[str, str], int] = field(default_factory=dict)
  # goal id -> (day, value)
  checkins: dict[object, list[tuple[date, float]]] = field(default_factory=dict)
  # project name (lowercase) -> id
  projects: dict[str, object] = field(default_factory=dict)
  # (day, kg, %) from Apple Health, oldest first; either may be missing on a day.
  body: list[tuple[date, float | None, float | None]] = field(default_factory=list)


def _anchored(clock: str, anchor_hour: int) -> int:
  hours, minutes = clock.split(":")
  return (int(hours) * 60 + int(minutes) - anchor_hour * 60) % 1440


def period_of(day: date, period: GoalPeriod) -> tuple[date, date]:
  if period == GoalPeriod.month:
    start = day.replace(day=1)
    return start, start + relativedelta(months=1) - timedelta(days=1)
  start = day - timedelta(days=day.weekday())
  return start, start + timedelta(days=6)


def _counter(goal: GoalSchema, data: ScoreData) -> Callable[[date, date], float]:
  """How much of the metric falls between two days, inclusive."""
  params = goal.params
  if goal.metric == GoalMetric.sleep_before:
    limit = _anchored(params["time"], ONSET_ANCHOR_HOUR)
    # A night counts for the day it began, the evening before waking.
    starts = [wake - timedelta(days=1) for wake, night in data.nights.items() if clock_minutes(night.onset, ONSET_ANCHOR_HOUR) <= limit]
    return lambda start, end: sum(1 for day in starts if start <= day <= end)
  if goal.metric == GoalMetric.wake_before:
    limit = _anchored(params["time"], WAKE_ANCHOR_HOUR)
    mornings = [wake for wake, night in data.nights.items() if clock_minutes(night.wake, WAKE_ANCHOR_HOUR) <= limit]
    return lambda start, end: sum(1 for day in mornings if start <= day <= end)
  if goal.metric == GoalMetric.gym_sessions:
    return lambda start, end: sum(1 for day in data.strength_days if start <= day <= end)
  if goal.metric == GoalMetric.tasks_completed:
    project = data.projects.get(str(params.get("project") or "").strip().lower()) if params.get("project") else None
    done = [day for day, project_id in data.completed if not params.get("project") or project_id == project]
    return lambda start, end: sum(1 for day in done if start <= day <= end)
  if goal.metric == GoalMetric.people_met:
    excluded = {tag.casefold() for tag in params.get("exclude_tags") or []}
    days = {m.day for m in data.met if not {t.casefold() for t in m.tags} & excluded}
    return lambda start, end: sum(1 for day in days if start <= day <= end)
  if goal.metric == GoalMetric.manual:
    entries = data.checkins.get(goal.id, [])
    return lambda start, end: sum(value for day, value in entries if start <= day <= end)
  raise ValueError(f"{goal.metric} has no periods")


def _measured(goal: GoalSchema, data: ScoreData) -> bool:
  match goal.metric:
    case GoalMetric.sleep_before | GoalMetric.wake_before:
      return bool(data.nights)
    case GoalMetric.gym_sessions:
      return bool(data.strength_days)
    case GoalMetric.people_met:
      return bool(data.met)
    case GoalMetric.net_worth:
      return any(currency == goal.params["currency"].upper() for _, currency in data.net_worth)
    case GoalMetric.body_weight | GoalMetric.body_fat:
      return _latest_body(goal, data) is not None
    case _:
      return True


def _latest_body(goal: GoalSchema, data: ScoreData) -> float | None:
  index = 1 if goal.metric == GoalMetric.body_weight else 2
  values = [row[index] for row in data.body if row[index] is not None]
  return values[-1] if values else None


def _met(goal: GoalSchema, value: float, *, finished: bool, target: float | None = None) -> bool:
  target = goal.target if target is None else target
  if goal.comparison == GoalComparison.at_least:
    return value >= target
  # At most: a period isn't over until it's over, but it has already failed once past the target.
  return value <= target if finished or value > target else True


def _step(goal: GoalSchema, history: Sequence[PeriodResult]) -> float | None:
  """The next rung when the target is still far off: one better than the best of the last few periods. None once the
  last two periods met the target, or with nothing to go on yet."""
  recent = list(history[-STEP_LOOKBACK:])
  if not recent or (len(recent) >= 2 and all(p.met for p in recent[-2:])):
    return None
  if goal.comparison == GoalComparison.at_least:
    rung = max(p.value for p in recent) + 1
    return rung if rung < goal.target else None
  rung = min(p.value for p in recent) - 1
  return rung if rung > goal.target else None


def score(goal: GoalSchema, data: ScoreData) -> GoalScore:
  unit = goal.params.get("currency", "").upper() if goal.metric == GoalMetric.net_worth else UNITS[goal.metric]
  if goal.period == GoalPeriod.none:
    if goal.metric == GoalMetric.net_worth:
      owner, currency = goal.params.get("owner", "all"), goal.params["currency"].upper()
      value = sum(v for (o, c), v in data.net_worth.items() if c == currency and owner in ("all", o)) / 100
    elif goal.metric in (GoalMetric.body_weight, GoalMetric.body_fat):
      value = _latest_body(goal, data) or 0.0
    else:
      value = _counter(goal, data)(date.min, data.today)
    current = PeriodResult(start=data.today, end=goal.deadline or data.today, value=value, met=_met(goal, value, finished=True))
    return GoalScore(goal=goal, unit=unit, current=current, history=[], streak=0, step=None, step_met=None, measured=_measured(goal, data))

  count = _counter(goal, data)
  start, end = period_of(data.today, goal.period)
  value = count(start, data.today)
  current = PeriodResult(start=start, end=end, value=value, met=_met(goal, value, finished=False))
  history: list[PeriodResult] = []
  cursor = start
  for _ in range(HISTORY[goal.period]):
    cursor = period_of(cursor - timedelta(days=1), goal.period)[0]
    first, last = period_of(cursor, goal.period)
    total = count(first, last)
    history.insert(0, PeriodResult(start=first, end=last, value=total, met=_met(goal, total, finished=True)))
  streak = 0
  for period in reversed(history):
    if not period.met:
      break
    streak += 1
  step = _step(goal, history)
  step_met = None if step is None else _met(goal, value, finished=False, target=step)
  return GoalScore(goal=goal, unit=unit, current=current, history=history, streak=streak, step=step, step_met=step_met, measured=_measured(goal, data))
