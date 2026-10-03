from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest
from api.calendars.recurrence import Recurrence, from_rule, occurrences_before, shift_weekdays, split_rule, to_rule, truncate_rule
from dateutil.rrule import rrulestr

STOCKHOLM = ZoneInfo("Europe/Stockholm")


def _occurrences(rule: str, dtstart: datetime | date) -> list[datetime]:
  start = dtstart if isinstance(dtstart, datetime) else datetime(dtstart.year, dtstart.month, dtstart.day)
  return list(rrulestr(rule, dtstart=start))


class TestToRule:
  @pytest.mark.parametrize(
    ("recurrence", "expected"),
    [
      (Recurrence("daily"), "FREQ=DAILY"),
      (Recurrence("weekly", interval=2, by_weekday=("WE", "MO")), "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE"),
      (Recurrence("monthly", count=6), "FREQ=MONTHLY;COUNT=6"),
      (Recurrence("yearly"), "FREQ=YEARLY"),
      # BYDAY only applies to weekly rules.
      (Recurrence("daily", by_weekday=("MO",)), "FREQ=DAILY"),
    ],
  )
  def test_structured_to_rule(self, recurrence: Recurrence, expected: str) -> None:
    assert to_rule(recurrence, all_day=False, time_zone="Europe/Stockholm") == expected

  def test_timed_until_is_end_of_local_day_in_utc(self) -> None:
    rule = to_rule(Recurrence("daily", until=date(2026, 10, 31)), all_day=False, time_zone="Europe/Stockholm")
    # 23:59:59 CET (after the DST change) is 22:59:59 UTC.
    assert rule == "FREQ=DAILY;UNTIL=20261031T225959Z"

  def test_all_day_until_is_a_date(self) -> None:
    rule = to_rule(Recurrence("weekly", until=date(2026, 12, 1)), all_day=True, time_zone="Europe/Stockholm")
    assert rule == "FREQ=WEEKLY;UNTIL=20261201"

  def test_count_wins_over_until(self) -> None:
    rule = to_rule(Recurrence("daily", count=3, until=date(2026, 12, 1)), all_day=False, time_zone="UTC")
    assert rule == "FREQ=DAILY;COUNT=3"


class TestFromRule:
  @pytest.mark.parametrize(
    ("rule", "expected"),
    [
      ("FREQ=WEEKLY;BYDAY=FR,MO", Recurrence("weekly", by_weekday=("MO", "FR"))),
      ("RRULE:FREQ=DAILY;INTERVAL=3;COUNT=4", Recurrence("daily", interval=3, count=4)),
      ("FREQ=WEEKLY;WKST=MO;BYDAY=TU", Recurrence("weekly", by_weekday=("TU",))),
      ("FREQ=WEEKLY;UNTIL=20261031T225959Z", Recurrence("weekly", until=date(2026, 10, 31))),
      ("FREQ=YEARLY;UNTIL=20301231", Recurrence("yearly", until=date(2030, 12, 31))),
    ],
  )
  def test_representable(self, rule: str, expected: Recurrence) -> None:
    assert from_rule(rule, time_zone="Europe/Stockholm") == expected

  @pytest.mark.parametrize(
    "rule",
    [
      "FREQ=MONTHLY;BYDAY=2MO",
      "FREQ=MONTHLY;BYMONTHDAY=15",
      "FREQ=HOURLY",
      "FREQ=YEARLY;BYMONTH=3",
      "FREQ=DAILY;BYDAY=MO,TU",
      "FREQ=DAILY;COUNT=many",
    ],
  )
  def test_custom_rules_are_not_representable(self, rule: str) -> None:
    assert from_rule(rule, time_zone="UTC") is None

  def test_round_trip(self) -> None:
    recurrence = Recurrence("weekly", interval=2, by_weekday=("MO", "TH"), until=date(2027, 3, 1))
    assert from_rule(to_rule(recurrence, all_day=False, time_zone="Asia/Tokyo"), time_zone="Asia/Tokyo") == recurrence


class TestSplitRule:
  def test_until_split_keeps_every_occurrence_once(self) -> None:
    dtstart = datetime(2026, 10, 5, 9, tzinfo=STOCKHOLM)
    split_at = datetime(2026, 10, 19, 9, tzinfo=STOCKHOLM)
    head, tail = split_rule("FREQ=WEEKLY;BYDAY=MO;UNTIL=20261130T230000Z", dtstart, split_at)

    assert head == "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261019T065959Z"
    assert tail == "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261130T230000Z"
    original = _occurrences("FREQ=WEEKLY;BYDAY=MO;UNTIL=20261130T230000Z", dtstart)
    assert head is not None
    assert _occurrences(head, dtstart) + _occurrences(tail, split_at) == original

  def test_count_is_divided(self) -> None:
    dtstart = datetime(2026, 10, 5, 9, tzinfo=STOCKHOLM)
    head, tail = split_rule("FREQ=DAILY;COUNT=10", dtstart, datetime(2026, 10, 9, 9, tzinfo=STOCKHOLM))
    assert (head, tail) == ("FREQ=DAILY;COUNT=4", "FREQ=DAILY;COUNT=6")

  def test_open_ended_series_gets_an_until(self) -> None:
    dtstart = datetime(2026, 10, 5, 9, tzinfo=STOCKHOLM)
    head, tail = split_rule("FREQ=DAILY", dtstart, datetime(2026, 10, 7, 9, tzinfo=STOCKHOLM))
    assert head == "FREQ=DAILY;UNTIL=20261007T065959Z"
    assert tail == "FREQ=DAILY"

  def test_split_at_first_occurrence_moves_everything(self) -> None:
    dtstart = datetime(2026, 10, 5, 9, tzinfo=STOCKHOLM)
    assert split_rule("FREQ=DAILY;COUNT=3", dtstart, dtstart) == (None, "FREQ=DAILY;COUNT=3")

  def test_all_day_series_split_with_date_until(self) -> None:
    head, tail = split_rule("FREQ=WEEKLY", date(2026, 10, 1), date(2026, 10, 15))
    assert (head, tail) == ("FREQ=WEEKLY;UNTIL=20261014", "FREQ=WEEKLY")
    assert head is not None
    assert len(_occurrences(head, date(2026, 10, 1))) == 2

  def test_across_dst_change(self) -> None:
    # Stockholm leaves summer time on 2026-10-25; occurrences stay at 09:00 local.
    dtstart = datetime(2026, 10, 12, 9, tzinfo=STOCKHOLM)
    split_at = datetime(2026, 10, 26, 9, tzinfo=STOCKHOLM)
    assert occurrences_before("FREQ=WEEKLY", dtstart, split_at) == 2
    head, _ = split_rule("FREQ=WEEKLY", dtstart, split_at)
    # 09:00 CET is 08:00 UTC, so the head ends at 07:59:59 UTC.
    assert head == "FREQ=WEEKLY;UNTIL=20261026T075959Z"
    assert head is not None
    assert [o.astimezone(UTC).hour for o in _occurrences(head, dtstart)] == [7, 7]

  def test_floating_until_on_zoned_series(self) -> None:
    dtstart = datetime(2026, 10, 5, 9, tzinfo=STOCKHOLM)
    assert occurrences_before("FREQ=DAILY;UNTIL=20261010T090000", dtstart, datetime(2026, 10, 8, 9, tzinfo=STOCKHOLM)) == 3

  def test_truncate(self) -> None:
    dtstart = datetime(2026, 10, 5, 9, tzinfo=STOCKHOLM)
    assert truncate_rule("FREQ=DAILY;COUNT=5", dtstart, datetime(2026, 10, 7, 9, tzinfo=STOCKHOLM)) == "FREQ=DAILY;COUNT=2"
    assert truncate_rule("FREQ=DAILY", dtstart, dtstart) is None


class TestShiftWeekdays:
  @pytest.mark.parametrize(
    ("rule", "days", "expected"),
    [
      ("FREQ=WEEKLY;BYDAY=MO,WE", 1, "FREQ=WEEKLY;BYDAY=TU,TH"),
      ("FREQ=WEEKLY;BYDAY=SU", 1, "FREQ=WEEKLY;BYDAY=MO"),
      ("FREQ=WEEKLY;BYDAY=MO", -1, "FREQ=WEEKLY;BYDAY=SU"),
      ("FREQ=MONTHLY;BYDAY=2MO", 2, "FREQ=MONTHLY;BYDAY=2WE"),
      ("FREQ=MONTHLY;BYMONTHDAY=15", 3, "FREQ=MONTHLY;BYMONTHDAY=18"),
      # Out-of-range month days are left alone rather than corrupted.
      ("FREQ=MONTHLY;BYMONTHDAY=30", 3, "FREQ=MONTHLY;BYMONTHDAY=30"),
      ("FREQ=WEEKLY;BYDAY=MO", 7, "FREQ=WEEKLY;BYDAY=MO"),
      ("FREQ=DAILY", 2, "FREQ=DAILY"),
      ("FREQ=WEEKLY;BYDAY=MO", 0, "FREQ=WEEKLY;BYDAY=MO"),
    ],
  )
  def test_shift(self, rule: str, days: int, expected: str) -> None:
    assert shift_weekdays(rule, days) == expected
