from datetime import date, datetime
from typing import Literal, Self
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import EmailStr, Field, field_validator, model_validator

from api.calendars.edits import EVENT_FIELDS, EditScope, EventChanges, EventTiming
from api.calendars.providers import AttendeeResponse
from api.calendars.recurrence import Frequency, Recurrence, from_rule, to_rule
from api.common.schemas import Schema
from api.models.calendar_account import CalendarProvider

Weekday = Literal["MO", "TU", "WE", "TH", "FR", "SA", "SU"]


def _check_time_zone(value: str) -> str:
  try:
    ZoneInfo(value)
  except (ZoneInfoNotFoundError, ValueError) as e:
    raise ValueError(f"Unknown time zone: {value}") from e
  return value


class CalendarSchema(Schema):
  id: UUID
  name: str
  color: str = Field(description="Hex color, `#rrggbb`.")
  hidden: bool
  writable: bool = Field(description="Events can be added and changed in this calendar.")
  primary: bool


class CalendarAccountSchema(Schema):
  id: UUID
  provider: CalendarProvider
  email: str
  can_write: bool = Field(description="False when the account was connected read-only and must be reconnected to edit.")
  last_synced_at: datetime | None
  sync_error: str | None = Field(description="Why the last sync failed, or null if it succeeded.")
  calendars: list[CalendarSchema]


class CalendarAccountListResponse(Schema):
  accounts: list[CalendarAccountSchema]


class GoogleAuthorizeResponse(Schema):
  url: str = Field(description="Google consent URL to open in a browser.")


class GoogleCallbackRequest(Schema):
  code: str = Field(min_length=1, max_length=2048, description="Authorization code Google appended to the redirect.")
  state: str = Field(min_length=1, max_length=4096, description="Opaque state from the authorize URL, echoed back by Google.")


class ICloudConnectRequest(Schema):
  apple_id: str = Field(min_length=3, max_length=320)
  app_password: str = Field(min_length=1, max_length=64, description="App-specific password from account.apple.com.")


class CalendarUpdate(Schema):
  hidden: bool


class CalendarEventAttendee(Schema):
  email: str
  name: str | None
  response: AttendeeResponse


# Local calendar values are strings on purpose: a JSON datetime would be read as
# an instant and shifted by the browser's zone; these pair with `time_zone`.
_DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}$"
_LOCAL_TIME_PATTERN = r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$"


def _parse_date(value: str | None) -> date | None:
  try:
    return date.fromisoformat(value) if value is not None else None
  except ValueError as e:
    raise ValueError(f"Invalid date: {value}") from e


def _parse_local_time(value: str | None) -> datetime | None:
  try:
    return datetime.fromisoformat(value) if value is not None else None
  except ValueError as e:
    raise ValueError(f"Invalid time: {value}") from e


class RecurrenceSchema(Schema):
  frequency: Frequency
  interval: int = Field(default=1, ge=1, le=99)
  by_weekday: list[Weekday] = Field(default_factory=list, description="Weekly rules only; empty means the start date's weekday.")
  count: int | None = Field(default=None, ge=1, le=730, description="Number of occurrences. Mutually exclusive with `until`.")
  until: str | None = Field(default=None, pattern=_DATE_PATTERN, description="Last day that may hold an occurrence (inclusive), YYYY-MM-DD.")

  @model_validator(mode="after")
  def _count_or_until(self) -> Self:
    if self.count is not None and self.until is not None:
      raise ValueError("Set either count or until, not both")
    if self.by_weekday and self.frequency != "weekly":
      raise ValueError("by_weekday only applies to weekly rules")
    return self

  def to_recurrence(self) -> Recurrence:
    return Recurrence(self.frequency, self.interval, tuple(self.by_weekday), self.count, _parse_date(self.until))


class CalendarEventSchema(Schema):
  id: UUID
  calendar_id: UUID
  title: str
  location: str | None
  all_day: bool
  start_at: datetime | None = Field(description="Timed events only.")
  end_at: datetime | None = Field(description="Timed events only.")
  start_date: date | None = Field(description="All-day events only.")
  end_date: date | None = Field(description="All-day events only; exclusive.")
  description: str | None = Field(description="Plain text; never HTML.")
  creator_name: str | None
  creator_email: str | None
  attendees: list[CalendarEventAttendee]
  my_response: AttendeeResponse | None = Field(default=None, description="The account's own reply when it's a guest; null when not invited.")
  conference_url: str | None = Field(description="Video meeting link, if any.")
  html_link: str | None = Field(description="Event page in the provider's own UI (Google only).")
  busy: bool = Field(description="False when the event is marked free/transparent.")
  recurring: bool
  editable: bool = Field(description="False for invitations organized by someone else and provider-managed events.")
  rule: str | None = Field(default=None, validation_alias="rrule", description="The series' RRULE value, if it repeats.")
  recurrence: RecurrenceSchema | None = Field(default=None, description="`rule` in structured form; null when not repeating or not representable.")

  @model_validator(mode="after")
  def _structured_recurrence(self) -> Self:
    if self.rule and self.recurrence is None:
      parsed = from_rule(self.rule, time_zone="UTC")
      if parsed is not None:
        self.recurrence = RecurrenceSchema(
          frequency=parsed.frequency,
          interval=parsed.interval,
          by_weekday=list(parsed.by_weekday),  # type: ignore[arg-type]
          count=parsed.count,
          until=parsed.until.isoformat() if parsed.until else None,
        )
    return self

  visibility: Literal["public", "private", "confidential"] | None = Field(description="Null means the calendar's default.")


class CalendarEventListResponse(Schema):
  events: list[CalendarEventSchema]


# Named outside the class: its `date` field would shadow the type in there.
_Moment = datetime | date


class EventTimeInput(Schema):
  date: str | None = Field(default=None, pattern=_DATE_PATTERN, description="All-day events: the calendar date, YYYY-MM-DD.", examples=["2026-10-07"])
  date_time: str | None = Field(
    default=None,
    pattern=_LOCAL_TIME_PATTERN,
    description="Timed events: local wall-clock time without an offset, YYYY-MM-DDTHH:MM.",
    examples=["2026-10-07T17:00"],
  )

  @model_validator(mode="after")
  def _one_kind(self) -> Self:
    if (self.date is None) == (self.date_time is None):
      raise ValueError("Set exactly one of date or date_time")
    _parse_date(self.date)
    _parse_local_time(self.date_time)
    return self

  def value(self, zone: ZoneInfo) -> "_Moment":
    if self.date is not None:
      parsed = _parse_date(self.date)
      assert parsed is not None
      return parsed
    moment = _parse_local_time(self.date_time)
    assert moment is not None
    return moment.replace(tzinfo=zone)


class EventTimingInput(Schema):
  start: EventTimeInput
  end: EventTimeInput = Field(description="Exclusive. For all-day events, the day after the last day.")
  time_zone: str = Field(description="IANA zone the times are in, e.g. Europe/Stockholm.")

  _zone = field_validator("time_zone")(_check_time_zone)

  @model_validator(mode="after")
  def _consistent(self) -> Self:
    if (self.start.date is None) != (self.end.date is None):
      raise ValueError("Start and end must both be dates or both be times")
    timing = self.to_timing()
    if timing.end <= timing.start:  # type: ignore[operator]
      raise ValueError("The event must end after it starts")
    return self

  def to_timing(self) -> EventTiming:
    zone = ZoneInfo(self.time_zone)
    return EventTiming(self.start.value(zone), self.end.value(zone), self.time_zone)


_INPUT_TO_CHANGE = {"recurrence": "rule"}


class EventFieldsInput(Schema):
  """Event fields to write. Omitted fields are left unchanged; null clears."""

  title: str | None = Field(default=None, max_length=1024)
  timing: EventTimingInput | None = None
  location: str | None = Field(default=None, max_length=1024)
  description: str | None = Field(default=None, max_length=8192)
  attendees: list[EmailStr] | None = Field(default=None, max_length=100, description="Guest emails (Google only); replaces the guest list.")
  recurrence: RecurrenceSchema | None = Field(default=None, description="How the event repeats; null stops it repeating.")
  busy: bool | None = Field(default=None, description="False shows the time as free.")
  add_conference: bool | None = Field(default=None, description="Adds a Google Meet link (Google only).")
  time_zone: str = Field(description="Zone the user is viewing the calendar in; used to read `recurrence.until`.")
  notify_guests: bool = Field(default=True, description="Email guests about the change (Google only).")

  _zone = field_validator("time_zone")(_check_time_zone)

  @field_validator("timing")
  @classmethod
  def _timing_not_null(cls, value: EventTimingInput | None) -> EventTimingInput | None:
    if value is None:
      raise ValueError("timing can't be null")
    return value

  def to_changes(self, *, all_day: bool) -> EventChanges:
    provided = {_INPUT_TO_CHANGE.get(name, name) for name in self.model_fields_set} & EVENT_FIELDS
    timing = self.timing.to_timing() if self.timing is not None else None
    if timing is not None:
      all_day = timing.all_day
    rule = to_rule(self.recurrence.to_recurrence(), all_day=all_day, time_zone=self.time_zone) if self.recurrence else None
    return EventChanges(
      provided=frozenset(provided),
      title=(self.title or "").strip(),
      timing=timing,
      location=(self.location or "").strip() or None,
      description=self.description or None,
      attendees=tuple(dict.fromkeys(str(a).lower() for a in self.attendees or [])),
      rule=rule,
      busy=self.busy if self.busy is not None else True,
      add_conference=bool(self.add_conference),
    )


class EventCreate(EventFieldsInput):
  timing: EventTimingInput  # type: ignore[assignment]


class EventUpdate(EventFieldsInput):
  scope: EditScope = Field(default=EditScope.this, description="For repeating events: this occurrence, this and following, or all.")
  calendar_id: UUID | None = Field(default=None, description="Move the event to another calendar of the same account.")


class EventWriteResponse(Schema):
  event: CalendarEventSchema | None = Field(description="The written event as synced back, or null if it falls outside the synced window.")
