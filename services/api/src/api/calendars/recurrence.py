"""RRULE helpers for the repeat rules Bessel offers, and for splitting series.

Rules are handled as RRULE *values* (`FREQ=WEEKLY;BYDAY=MO`), without the
`RRULE:` prefix Google uses in its `recurrence` list.
"""

import re
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal, get_args
from zoneinfo import ZoneInfo

from dateutil.rrule import rrulestr

Frequency = Literal["daily", "weekly", "monthly", "yearly"]
WEEKDAYS = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")
# Rule parts the structured editor understands; anything else is shown as a
# custom rule and preserved untouched unless the user replaces it.
_EDITABLE_PARTS = frozenset({"FREQ", "INTERVAL", "BYDAY", "COUNT", "UNTIL", "WKST"})
_BYDAY_TOKEN = re.compile(r"^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$")


@dataclass(frozen=True, slots=True)
class Recurrence:
  frequency: Frequency
  interval: int = 1
  # Weekly rules only; empty means "the start date's weekday".
  by_weekday: tuple[str, ...] = ()
  count: int | None = None
  # Last day that may hold an occurrence, inclusive, in the event's zone.
  until: date | None = None


def parse_rule(rule: str) -> dict[str, str]:
  parts: dict[str, str] = {}
  for part in rule.removeprefix("RRULE:").split(";"):
    if "=" in part:
      key, value = part.split("=", 1)
      parts[key.strip().upper()] = value.strip()
  return parts


def format_rule(parts: dict[str, str]) -> str:
  ordered = {"FREQ": parts["FREQ"], **{k: v for k, v in parts.items() if k != "FREQ"}}
  return ";".join(f"{key}={value}" for key, value in ordered.items())


def to_rule(recurrence: Recurrence, *, all_day: bool, time_zone: str) -> str:
  parts = {"FREQ": recurrence.frequency.upper()}
  if recurrence.interval > 1:
    parts["INTERVAL"] = str(recurrence.interval)
  if recurrence.frequency == "weekly" and recurrence.by_weekday:
    parts["BYDAY"] = ",".join(day for day in WEEKDAYS if day in recurrence.by_weekday)
  if recurrence.count is not None:
    parts["COUNT"] = str(recurrence.count)
  elif recurrence.until is not None:
    parts["UNTIL"] = _until_value(recurrence.until, all_day=all_day, time_zone=time_zone)
  return format_rule(parts)


def _until_value(until: date, *, all_day: bool, time_zone: str) -> str:
  if all_day:
    return until.strftime("%Y%m%d")
  # RFC 5545 requires UTC for UNTIL when DTSTART has a zone; the end of the
  # chosen local day keeps that day's occurrence.
  end_of_day = datetime.combine(until, time(23, 59, 59), tzinfo=ZoneInfo(time_zone))
  return end_of_day.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def from_rule(rule: str, *, time_zone: str) -> Recurrence | None:
  """The structured form of `rule`, or None if it uses parts the editor can't show."""
  parts = parse_rule(rule)
  frequency = parts.get("FREQ", "").lower()
  if frequency not in get_args(Frequency) or not parts.keys() <= _EDITABLE_PARTS:
    return None
  weekdays: tuple[str, ...] = ()
  if "BYDAY" in parts:
    tokens = parts["BYDAY"].split(",")
    # Monthly "second Monday" style rules aren't representable.
    if frequency != "weekly" or not all(token in WEEKDAYS for token in tokens):
      return None
    weekdays = tuple(day for day in WEEKDAYS if day in tokens)
  try:
    interval = int(parts.get("INTERVAL", "1"))
    count = int(parts["COUNT"]) if "COUNT" in parts else None
  except ValueError:
    return None
  until = _parse_until(parts["UNTIL"], time_zone) if "UNTIL" in parts else None
  return Recurrence(frequency=frequency, interval=interval, by_weekday=weekdays, count=count, until=until)  # type: ignore[arg-type]


def _parse_until(value: str, time_zone: str) -> date | None:
  try:
    if "T" not in value:
      return datetime.strptime(value[:8], "%Y%m%d").date()
    moment = datetime.strptime(value.rstrip("Z"), "%Y%m%dT%H%M%S")
    if value.endswith("Z"):
      return moment.replace(tzinfo=UTC).astimezone(ZoneInfo(time_zone)).date()
    return moment.date()
  except ValueError:
    return None


def _as_rrule_datetime(value: datetime | date) -> datetime:
  return value if isinstance(value, datetime) else datetime.combine(value, time())


def occurrences_before(rule: str, dtstart: datetime | date, boundary: datetime | date) -> int:
  """How many occurrences the rule generates strictly before `boundary`."""
  start, limit = _as_rrule_datetime(dtstart), _as_rrule_datetime(boundary)
  try:
    occurrences = iter(rrulestr(rule, dtstart=start))
  except ValueError:
    # Some providers write a floating UNTIL for a zoned series, which dateutil
    # rejects; compare on the series' own wall clock instead.
    zone = start.tzinfo
    start = start.replace(tzinfo=None)
    limit = limit.astimezone(zone).replace(tzinfo=None) if limit.tzinfo else limit
    occurrences = iter(rrulestr(rule, dtstart=start))
  count = 0
  for occurrence in occurrences:
    if occurrence >= limit:
      break
    count += 1
  return count


def split_rule(rule: str, dtstart: datetime | date, split_at: datetime | date) -> tuple[str | None, str]:
  """Rules for the occurrences before `split_at` and for those from it on.

  The first rule is None when nothing precedes `split_at`, i.e. the whole series
  moves to the second rule. COUNT is divided between the two halves; otherwise
  the first half ends with an UNTIL just before the split (RRULE can't carry
  both).
  """
  parts = parse_rule(rule)
  before = occurrences_before(rule, dtstart, split_at)
  if before == 0:
    return None, rule
  head, tail = dict(parts), dict(parts)
  if "COUNT" in parts:
    head["COUNT"] = str(before)
    tail["COUNT"] = str(max(int(parts["COUNT"]) - before, 1))
  else:
    head["UNTIL"] = _until_before(split_at)
  return format_rule(head), format_rule(tail)


def truncate_rule(rule: str, dtstart: datetime | date, split_at: datetime | date) -> str | None:
  """The rule ending just before `split_at`, or None if nothing would remain."""
  head, _ = split_rule(rule, dtstart, split_at)
  return head


def _until_before(split_at: datetime | date) -> str:
  if isinstance(split_at, datetime):
    return (split_at - timedelta(seconds=1)).astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")
  return (split_at - timedelta(days=1)).strftime("%Y%m%d")


def shift_weekdays(rule: str, days: int) -> str:
  """Moves BYDAY (and BYMONTHDAY) along with a series whose start moved `days`.

  Without this, moving a "weekly on Monday" series to Tuesday would keep
  generating Mondays.
  """
  shift = days % 7
  parts = parse_rule(rule)
  if days == 0:
    return rule
  if "BYDAY" in parts and shift:
    shifted: list[str] = []
    for token in parts["BYDAY"].split(","):
      match = _BYDAY_TOKEN.match(token)
      if not match:
        return rule
      ordinal, weekday = match.groups()
      shifted.append(f"{ordinal or ''}{WEEKDAYS[(WEEKDAYS.index(weekday) + shift) % 7]}")
    parts["BYDAY"] = ",".join(shifted)
  if "BYMONTHDAY" in parts:
    try:
      monthdays = [int(day) + days for day in parts["BYMONTHDAY"].split(",")]
    except ValueError:
      return rule
    if all(1 <= day <= 31 for day in monthdays):
      parts["BYMONTHDAY"] = ",".join(str(day) for day in monthdays)
  return format_rule(parts)
