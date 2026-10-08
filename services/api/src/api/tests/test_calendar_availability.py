from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from api.calendars.availability import DayAvailability, Interval, busy_intervals, ceil_to_step, daily_availability, merge
from api.models.calendar_event import CalendarEvent

STOCKHOLM = ZoneInfo("Europe/Stockholm")
LONG_AGO = datetime(2000, 1, 1, tzinfo=UTC)
MONDAY = date(2026, 10, 5)


def local(day: date, hour: int, minute: int = 0) -> datetime:
  return datetime(day.year, day.month, day.day, hour, minute, tzinfo=STOCKHOLM)


def span(day: date, start: tuple[int, int], end: tuple[int, int]) -> Interval:
  return Interval(local(day, *start).astimezone(UTC), local(day, *end).astimezone(UTC))


def availability(busy: list[Interval], first_day: date = MONDAY, last_day: date = MONDAY, **overrides: Any) -> list[DayAvailability]:
  options: dict[str, Any] = {"day_start": time(9), "day_end": time(18), "tz": STOCKHOLM, "now": LONG_AGO, **overrides}
  return daily_availability(busy, first_day=first_day, last_day=last_day, **options)


def timed(start: datetime, end: datetime, *, busy: bool = True, my_response: str | None = None) -> CalendarEvent:
  return CalendarEvent(title="Event", all_day=False, start_at=start, end_at=end, busy=busy, my_response=my_response)


class TestMerge:
  def test_joins_overlapping_and_back_to_back(self) -> None:
    merged = merge([span(MONDAY, (12, 0), (13, 0)), span(MONDAY, (10, 0), (11, 0)), span(MONDAY, (10, 30), (12, 0)), span(MONDAY, (14, 0), (15, 0))])
    assert merged == [span(MONDAY, (10, 0), (13, 0)), span(MONDAY, (14, 0), (15, 0))]

  def test_contained_interval_does_not_shrink_the_outer_one(self) -> None:
    assert merge([span(MONDAY, (10, 0), (14, 0)), span(MONDAY, (11, 0), (12, 0))]) == [span(MONDAY, (10, 0), (14, 0))]

  def test_drops_empty_intervals(self) -> None:
    assert merge([span(MONDAY, (10, 0), (10, 0))]) == []


class TestBusyIntervals:
  def test_only_busy_timed_events_not_declined_block(self) -> None:
    start, end = local(MONDAY, 10), local(MONDAY, 11)
    events = [
      timed(start, end),
      timed(start, end, my_response="tentative"),
      timed(start, end, my_response="needs_action"),
      timed(start, end, my_response="declined"),
      timed(start, end, busy=False),
      CalendarEvent(title="Holiday", all_day=True, start_date=MONDAY, end_date=MONDAY + timedelta(days=1), busy=True),
    ]
    assert busy_intervals(events) == [Interval(start, end)] * 3


class TestDailyAvailability:
  def test_gaps_between_events(self) -> None:
    [day] = availability([span(MONDAY, (10, 0), (11, 0)), span(MONDAY, (10, 30), (12, 0)), span(MONDAY, (12, 0), (13, 0))])
    assert day.free == [span(MONDAY, (9, 0), (10, 0)), span(MONDAY, (13, 0), (18, 0))]

  def test_events_spanning_the_window_edges(self) -> None:
    [day] = availability([span(MONDAY, (7, 0), (9, 30)), span(MONDAY, (17, 30), (20, 0))])
    assert day.free == [span(MONDAY, (9, 30), (17, 30))]

  def test_event_covering_the_whole_window(self) -> None:
    overnight = Interval(local(MONDAY - timedelta(days=1), 20), local(MONDAY + timedelta(days=1), 2))
    [day] = availability([overnight])
    assert day.free == []

  def test_slots_keep_maximal_windows_of_at_least_the_duration(self) -> None:
    [day] = availability([span(MONDAY, (9, 30), (12, 0)), span(MONDAY, (13, 0), (14, 0))])
    assert day.slots(timedelta(hours=1)) == [span(MONDAY, (12, 0), (13, 0)), span(MONDAY, (14, 0), (18, 0))]
    assert day.slots(timedelta(minutes=90)) == [span(MONDAY, (14, 0), (18, 0))]

  def test_skips_weekends_unless_included(self) -> None:
    friday, monday = MONDAY + timedelta(days=4), MONDAY + timedelta(days=7)
    assert [d.day for d in availability([], friday, monday)] == [friday, monday]
    assert len(availability([], friday, monday, include_weekends=True)) == 4

  def test_midnight_day_end_means_end_of_day(self) -> None:
    [day] = availability([], day_start=time(20), day_end=time.min)
    assert day.free == [Interval(local(MONDAY, 20).astimezone(UTC), local(MONDAY + timedelta(days=1), 0).astimezone(UTC))]

  def test_clips_to_now_rounded_up_to_the_quarter_hour(self) -> None:
    tuesday = MONDAY + timedelta(days=1)
    days = availability([span(MONDAY, (11, 0), (12, 0))], MONDAY, tuesday, now=local(MONDAY, 10, 7))
    assert days[0].free == [span(MONDAY, (10, 15), (11, 0)), span(MONDAY, (12, 0), (18, 0))]
    assert days[1].free == [span(tuesday, (9, 0), (18, 0))]

  def test_window_already_over(self) -> None:
    [day] = availability([], now=local(MONDAY, 18, 1))
    assert day.free == []

  def test_dst_end_day_is_an_hour_longer(self) -> None:
    fall_back = date(2026, 10, 25)
    [day] = availability([], fall_back, fall_back, day_start=time(0), day_end=time(6), include_weekends=True)
    [free] = day.free
    assert free.duration == timedelta(hours=7)
    assert (free.start.astimezone(STOCKHOLM).isoformat(), free.end.astimezone(STOCKHOLM).isoformat()) == (
      "2026-10-25T00:00:00+02:00",
      "2026-10-25T06:00:00+01:00",
    )

  def test_dst_start_day_is_an_hour_shorter(self) -> None:
    spring_forward = date(2026, 3, 29)
    busy = Interval(local(spring_forward, 3), local(spring_forward, 4))
    [day] = availability([busy], spring_forward, spring_forward, day_start=time(0), day_end=time(6), include_weekends=True)
    assert [f.duration for f in day.free] == [timedelta(hours=2), timedelta(hours=2)]


class TestCeilToStep:
  def test_rounds_up_only_when_needed(self) -> None:
    assert ceil_to_step(datetime(2026, 10, 5, 10, 0, tzinfo=UTC)) == datetime(2026, 10, 5, 10, 0, tzinfo=UTC)
    assert ceil_to_step(datetime(2026, 10, 5, 10, 0, 1, tzinfo=UTC)) == datetime(2026, 10, 5, 10, 15, tzinfo=UTC)
    assert ceil_to_step(datetime(2026, 10, 5, 23, 50, tzinfo=STOCKHOLM)) == datetime(2026, 10, 5, 22, 0, tzinfo=UTC)
