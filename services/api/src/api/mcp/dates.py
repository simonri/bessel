"""Days and timezones for tools: agents pass days the way people say them."""

import re
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field

from api.models.user import User

DAY_HELP = (
  "YYYY-MM-DD, or a relative day: today, tomorrow, yesterday, a weekday (the next one, e.g. 'fri'), 'next week' (next Monday), 'in 3 days', 'last monday'"
)

Day = Annotated[str, Field(description=f"A day: {DAY_HELP}.")]
TimezoneParam = Annotated[
  str | None,
  Field(description="IANA timezone, e.g. 'Europe/Stockholm'. Leave empty to use the user's own timezone."),
]

_WEEKDAYS = [
  ("monday", "mon"),
  ("tuesday", "tue", "tues"),
  ("wednesday", "wed"),
  ("thursday", "thu", "thur", "thurs"),
  ("friday", "fri"),
  ("saturday", "sat"),
  ("sunday", "sun"),
]
_IN_N = re.compile(r"^in (\d{1,3}) (day|days|week|weeks)$")
_N_AGO = re.compile(r"^(\d{1,3}) (day|days|week|weeks) ago$")


def _weekday(word: str) -> int | None:
  return next((i for i, names in enumerate(_WEEKDAYS) if word in names), None)


def resolve_timezone(user: User, override: str | None) -> ZoneInfo:
  """`override` if given, else the timezone the user's apps reported."""
  name = override or user.timezone
  if not name:
    raise ToolError("The user's timezone isn't known yet. Pass `timezone` (IANA name, e.g. 'Europe/Stockholm').")
  try:
    return ZoneInfo(name)
  except (ZoneInfoNotFoundError, ValueError) as e:
    raise ToolError(f"Unknown timezone: {name}") from e


def today_in(tz: ZoneInfo) -> date:
  return datetime.now(tz).date()


def parse_day(text: str, today: date) -> date:
  """A day written as ISO or as a relative phrase, relative to `today`."""
  value = " ".join(text.strip().lower().split())
  try:
    return date.fromisoformat(value)
  except ValueError:
    pass
  if value in ("today", "tod", "tonight"):
    return today
  if value in ("tomorrow", "tmr", "tmrw"):
    return today + timedelta(days=1)
  if value == "yesterday":
    return today - timedelta(days=1)
  if value == "next week":
    return today + timedelta(days=7 - today.weekday())
  if match := _IN_N.match(value):
    amount = int(match[1]) * (7 if match[2].startswith("week") else 1)
    return today + timedelta(days=amount)
  if match := _N_AGO.match(value):
    amount = int(match[1]) * (7 if match[2].startswith("week") else 1)
    return today - timedelta(days=amount)
  words = value.split(" ")
  if len(words) == 2 and words[0] == "last" and (weekday := _weekday(words[1])) is not None:
    return today - timedelta(days=(today.weekday() - weekday) % 7 or 7)
  if (weekday := _weekday(words[-1])) is not None and words[:-1] in ([], ["next"], ["on"], ["this"]):
    return today + timedelta(days=(weekday - today.weekday()) % 7 or 7)
  raise ToolError(f"Couldn't read the day {text!r}. Use {DAY_HELP}.")


def local_window(start: date, end: date, tz: ZoneInfo, *, max_days: int) -> tuple[datetime, datetime]:
  """[start of `start`, start of the day after `end`) in `tz`, as UTC datetimes."""
  if end < start:
    raise ToolError("The end day must not be before the start day.")
  if (end - start).days + 1 > max_days:
    raise ToolError(f"The range can span at most {max_days} days.")
  return (
    datetime.combine(start, time.min, tzinfo=tz).astimezone(UTC),
    datetime.combine(end + timedelta(days=1), time.min, tzinfo=tz).astimezone(UTC),
  )
