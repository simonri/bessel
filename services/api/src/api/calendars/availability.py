"""Free time between calendar events, within daily working hours.

All arithmetic happens on UTC instants: subtracting two aware datetimes that
share a `ZoneInfo` is wall-clock arithmetic and would be an hour off on DST
transition days.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from api.models.calendar_event import CalendarEvent

SLOT_STEP = timedelta(minutes=15)


@dataclass(frozen=True)
class Interval:
  """A span between two instants; kept in UTC so durations are real elapsed time."""

  start: datetime
  end: datetime

  @property
  def duration(self) -> timedelta:
    return self.end - self.start


@dataclass(frozen=True)
class DayAvailability:
  day: date
  free: list[Interval]
  """Every maximal free stretch inside the day's working hours, as UTC instants."""

  def slots(self, min_duration: timedelta) -> list[Interval]:
    return [interval for interval in self.free if interval.duration >= min_duration]


def blocks_time(event: CalendarEvent) -> bool:
  """Whether the event makes the user unavailable.

  Only timed events count: all-day events (birthdays, holidays, "working from
  home") usually don't occupy the day. Events marked free/transparent and
  invitations the user declined don't block either; tentative and unanswered
  invitations do.
  """
  return not event.all_day and event.busy and event.my_response != "declined"


def busy_intervals(events: Iterable[CalendarEvent]) -> list[Interval]:
  intervals: list[Interval] = []
  for event in events:
    if blocks_time(event):
      assert event.start_at is not None and event.end_at is not None
      intervals.append(Interval(event.start_at, event.end_at))
  return intervals


def merge(intervals: Iterable[Interval]) -> list[Interval]:
  """Sorted, with overlapping and back-to-back intervals joined."""
  merged: list[Interval] = []
  for interval in sorted(intervals, key=lambda i: i.start):
    if interval.end <= interval.start:
      continue
    if merged and interval.start <= merged[-1].end:
      merged[-1] = Interval(merged[-1].start, max(merged[-1].end, interval.end))
    else:
      merged.append(interval)
  return merged


def ceil_to_step(moment: datetime, step: timedelta = SLOT_STEP) -> datetime:
  epoch = datetime(1970, 1, 1, tzinfo=UTC)
  elapsed = moment.astimezone(UTC) - epoch
  remainder = elapsed % step
  return moment.astimezone(UTC) + (step - remainder if remainder else timedelta())


def daily_availability(
  busy: Iterable[Interval],
  *,
  first_day: date,
  last_day: date,
  day_start: time,
  day_end: time,
  tz: ZoneInfo,
  now: datetime,
  include_weekends: bool = False,
) -> list[DayAvailability]:
  """Free stretches per local day from `first_day` to `last_day`, inclusive.

  Each day's window runs from `day_start` to `day_end` local time; a `day_end`
  of midnight means the end of the day. Nothing before `now`, rounded up to the
  next 15 minutes, is free. Weekends are skipped unless `include_weekends`.
  """
  blocked: Sequence[Interval] = merge(Interval(i.start.astimezone(UTC), i.end.astimezone(UTC)) for i in busy)
  earliest = ceil_to_step(now)
  days: list[DayAvailability] = []
  day = first_day
  while day <= last_day:
    if include_weekends or day.weekday() < 5:
      end_day = day + timedelta(days=1) if day_end == time.min else day
      window_start = max(datetime.combine(day, day_start, tzinfo=tz).astimezone(UTC), earliest)
      window_end = datetime.combine(end_day, day_end, tzinfo=tz).astimezone(UTC)
      days.append(DayAvailability(day, _gaps(blocked, window_start, window_end)))
    day += timedelta(days=1)
  return days


def _gaps(blocked: Sequence[Interval], start: datetime, end: datetime) -> list[Interval]:
  gaps: list[Interval] = []
  cursor = start
  for interval in blocked:
    if interval.end <= cursor:
      continue
    if interval.start >= end:
      break
    if interval.start > cursor:
      gaps.append(Interval(cursor, interval.start))
    cursor = interval.end
  if cursor < end:
    gaps.append(Interval(cursor, end))
  return gaps
