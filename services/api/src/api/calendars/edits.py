"""Provider-neutral descriptions of event writes."""

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import StrEnum
from zoneinfo import ZoneInfo


class EditScope(StrEnum):
  """Which occurrences of a repeating event a change applies to."""

  this = "this"
  following = "following"
  all = "all"


class UnsupportedEditError(Exception):
  """The change is valid in general but not for this event or scope."""


@dataclass(frozen=True, slots=True)
class EventTiming:
  # Aware datetimes in `time_zone`, or dates (end exclusive) for all-day events.
  start: datetime | date
  end: datetime | date
  # IANA zone the times were entered in; Google needs it for repeating events.
  time_zone: str

  @property
  def all_day(self) -> bool:
    return not isinstance(self.start, datetime)


EVENT_FIELDS = frozenset({"title", "timing", "location", "description", "attendees", "rule", "busy", "add_conference"})


@dataclass(frozen=True, slots=True)
class EventChanges:
  """Field values to write; only names listed in `provided` are applied."""

  provided: frozenset[str]
  title: str = ""
  timing: EventTiming | None = None
  location: str | None = None
  description: str | None = None
  attendees: tuple[str, ...] = ()
  # RRULE value; None (when provided) stops the event repeating.
  rule: str | None = None
  busy: bool = True
  add_conference: bool = False

  def __post_init__(self) -> None:
    unknown = self.provided - EVENT_FIELDS
    if unknown:
      raise ValueError(f"Unknown event fields: {sorted(unknown)}")
    if "timing" in self.provided and self.timing is None:
      raise ValueError("timing can't be cleared")

  def has(self, name: str) -> bool:
    return name in self.provided


@dataclass(frozen=True, slots=True)
class TargetEvent:
  """The synced occurrence a change starts from."""

  calendar_external_id: str
  external_id: str
  start: datetime | date
  end: datetime | date
  series_id: str | None = None
  original_start: str | None = None
  rule: str | None = None
  etag: str | None = None
  resource_href: str | None = None
  attendee_emails: tuple[str, ...] = field(default=())

  @property
  def recurring(self) -> bool:
    return self.series_id is not None

  @property
  def all_day(self) -> bool:
    return not isinstance(self.start, datetime)

  def original_slot(self) -> datetime | date:
    """Where this occurrence sits in its series, even if it was moved."""
    if self.original_start is None:
      return self.start
    return parse_moment(self.original_start)


def parse_moment(value: str) -> datetime | date:
  return date.fromisoformat(value) if len(value) == 10 else datetime.fromisoformat(value)


def wall_clock_delta(old: datetime | date, new: datetime | date, time_zone: str) -> timedelta:
  """How far an occurrence moved on the wall clock.

  Measured in `time_zone` so that moving a 09:00 series to 10:00 stays a
  one-hour move on both sides of a DST change.
  """
  if isinstance(old, datetime) and isinstance(new, datetime):
    zone = ZoneInfo(time_zone)
    return new.astimezone(zone).replace(tzinfo=None) - old.astimezone(zone).replace(tzinfo=None)
  return _as_date(new) - _as_date(old)


def _as_date(value: datetime | date) -> date:
  return value.date() if isinstance(value, datetime) else value
