"""A typical weekday from the user's own data: what an average Tuesday actually looks like, to set a plan against."""

import statistics
from datetime import date, datetime, timedelta

from api.goals.schemas import TypicalDay
from api.patterns.service import NIGHT_END_HOUR, ONSET_ANCHOR_HOUR, WAKE_ANCHOR_HOUR, PatternData, clock_minutes, format_clock

# A day runs from NIGHT_END_HOUR to NIGHT_END_HOUR the next morning, so a session past midnight belongs to the evening.
DAY_ANCHOR_HOUR = NIGHT_END_HOUR


def _median_clock(values: list[float], anchor: int) -> str | None:
  return format_clock(statistics.median(values), anchor) if values else None


def typical_day(data: PatternData, weekday: int, weeks: int) -> TypicalDay:
  days = [day for day in (data.end - timedelta(days=n) for n in range(1, weeks * 7 + 1)) if day.weekday() == weekday and day >= data.start]
  wakes, onsets, starts, ends, hours, tasks, steps = [], [], [], [], [], [], []
  gym = 0
  seen = 0
  completed: dict[date, int] = {}
  for task in data.completed:
    if task.completed_at is not None:
      local = task.completed_at.astimezone(data.tz)
      day = (local - timedelta(hours=DAY_ANCHOR_HOUR)).date()
      completed[day] = completed.get(day, 0) + 1

  for day in days:
    had = False
    if (woke := data.nights.get(day)) is not None:
      wakes.append(clock_minutes(woke.wake, WAKE_ANCHOR_HOUR))
      had = True
    if (slept := data.nights.get(day + timedelta(days=1))) is not None:
      onsets.append(clock_minutes(slept.onset, ONSET_ANCHOR_HOUR))
      had = True
    begin = datetime.combine(day, datetime.min.time(), tzinfo=data.tz) + timedelta(hours=DAY_ANCHOR_HOUR)
    end = begin + timedelta(days=1)
    used = [(max(s, int(begin.timestamp())), min(e, int(end.timestamp()))) for s, e in data.periods if e > begin.timestamp() and s < end.timestamp()]
    if used:
      starts.append(clock_minutes(datetime.fromtimestamp(used[0][0], data.tz), DAY_ANCHOR_HOUR))
      ends.append(clock_minutes(datetime.fromtimestamp(used[-1][1], data.tz), DAY_ANCHOR_HOUR))
      hours.append(sum(e - s for s, e in used) / 3600)
      had = True
    if day in data.steps:
      steps.append(data.steps[day])
      had = True
    gym += day in data.strength_days
    tasks.append(completed.get(day, 0))
    seen += had

  return TypicalDay(
    weekday=weekday,
    weeks=weeks,
    days=seen,
    wake=_median_clock(wakes, WAKE_ANCHOR_HOUR),
    asleep=_median_clock(onsets, ONSET_ANCHOR_HOUR),
    computer_from=_median_clock(starts, DAY_ANCHOR_HOUR),
    computer_until=_median_clock(ends, DAY_ANCHOR_HOUR),
    computer_hours=round(statistics.median(hours), 1) if hours else None,
    tasks_completed=round(sum(tasks) / len(tasks), 1) if tasks else 0,
    gym_share=round(gym / len(days), 2) if days else 0,
    steps=round(statistics.median(steps)) if steps else None,
  )
