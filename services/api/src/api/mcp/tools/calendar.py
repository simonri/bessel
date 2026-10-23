import re
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated
from uuid import UUID

from mcp.server.mcpserver import Context
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field, ValidationError

from api.calendars.availability import busy_intervals, daily_availability
from api.calendars.editing import calendar_edit_service
from api.calendars.providers import AttendeeResponse
from api.calendars.repository import CalendarEventRepository, CalendarPersonRepository, CalendarRepository
from api.calendars.schemas import EventCreate
from api.calendars.service import calendar_service
from api.common.schemas import Schema
from api.common.utils import utc_now
from api.mcp.context import request_redis, user_session
from api.mcp.dates import Day, TimezoneParam, local_window, parse_day, resolve_timezone, today_in
from api.mcp.tools.common import ToolSpec, read, write
from api.models.calendar import Calendar
from api.models.calendar_account import CalendarAccount

MAX_CALENDAR_DAYS = 62
MAX_FREE_TIME_DAYS = 31
DEFAULT_FREE_TIME_DAYS = 7
MAX_NEW_EVENTS = 50
DEFAULT_EVENT_MINUTES = 60
_CLOCK = re.compile(r"^(\d{1,2}):([0-5]\d)$")


class CalendarAttendee(Schema):
  name: str | None
  email: str
  response: AttendeeResponse
  is_organizer: bool


class CalendarEvent(Schema):
  id: UUID
  title: str
  calendar: str = Field(description="The calendar it's in, such as a work, family or holidays calendar.")
  all_day: bool
  start: datetime | date = Field(description="Start time, or start date for all-day events.")
  end: datetime | date = Field(description="End time, or the exclusive end date for all-day events.")
  location: str | None
  description: str | None
  attendees: list[CalendarAttendee]
  my_response: AttendeeResponse | None = Field(description="The user's own reply when invited; null when they aren't a guest.")
  conference_url: str | None
  busy: bool
  recurring: bool


class CalendarEvents(Schema):
  events: list[CalendarEvent] = Field(description="Sorted by start.")


async def get_calendar_events(ctx: Context, start: Day = "today", end: Day = "today", timezone: TimezoneParam = None) -> CalendarEvents:
  """Events from all of the user's connected calendars that overlap the given days.

  Use it for "what's on my calendar today/this week" and to check what a day looks like before planning it.
  """
  async with user_session(ctx) as (session, user):
    tz = resolve_timezone(user, timezone)
    today = today_in(tz)
    start_day, end_day = parse_day(start, today), parse_day(end, today)
    window_start, window_end = local_window(start_day, end_day, tz, max_days=MAX_CALENDAR_DAYS)
    rows = await CalendarEventRepository.from_session(session).list_in_range(user.id, window_start, window_end)
    events = await calendar_service.event_schemas(CalendarPersonRepository.from_session(session), user.id, rows)
    calendars = await CalendarRepository.from_session(session).names_for_user(user.id)

  result: list[CalendarEvent] = []
  for event in events:
    if event.all_day:
      assert event.start_date is not None and event.end_date is not None
      # All-day rows come back padded by a day each side; keep only the requested days.
      if event.end_date <= start_day or event.start_date > end_day:
        continue
      event_start: datetime | date = event.start_date
      event_end: datetime | date = event.end_date
    else:
      assert event.start_at is not None and event.end_at is not None
      event_start, event_end = event.start_at, event.end_at
    result.append(
      CalendarEvent(
        id=event.id,
        title=event.title,
        calendar=calendars.get(event.calendar_id, ""),
        all_day=event.all_day,
        start=event_start,
        end=event_end,
        location=event.location,
        description=event.description,
        attendees=[CalendarAttendee(name=a.name, email=a.email, response=a.response, is_organizer=a.is_organizer) for a in event.attendees if not a.is_self],
        my_response=event.my_response,
        conference_url=event.conference_url,
        busy=event.busy,
        recurring=event.recurring,
      )
    )
  result.sort(key=lambda e: e.start if isinstance(e.start, datetime) else datetime.combine(e.start, time.min, tzinfo=tz))
  return CalendarEvents(events=result)


class FreeSlot(Schema):
  start: datetime = Field(description="Local time with UTC offset.")
  end: datetime = Field(description="Local time with UTC offset.")
  minutes: int


class FreeDay(Schema):
  day: date
  free_minutes: int = Field(description="All free time within the day's hours, including gaps shorter than the requested duration.")
  longest_free_minutes: int
  all_day_events: list[str] = Field(description="Titles of all-day events that day; they don't block time but may matter (e.g. a holiday).")


class FreeTime(Schema):
  timezone: str
  slots: list[FreeSlot] = Field(description="Free windows at least the requested duration long, sorted by start, up to `limit`.")
  total_slots: int = Field(description="How many matching windows there are in total, before `limit`.")
  days: list[FreeDay] = Field(description="One entry per searched day; weekends are left out unless included.")


def _parse_clock(text: str, name: str) -> int:
  """Minutes past midnight."""
  match = _CLOCK.match(text.strip())
  minutes = int(match[1]) * 60 + int(match[2]) if match else None
  if minutes is None or minutes > 24 * 60:
    raise ToolError(f"`{name}` must be a local time as HH:MM, e.g. '09:00'; got {text!r}.")
  return minutes


def _minutes(span: timedelta) -> int:
  return int(span.total_seconds() // 60)


async def find_free_time(
  ctx: Context,
  duration_minutes: Annotated[int, Field(ge=5, le=720, description="How long the free window must be, in minutes.")],
  start: Day = "today",
  end: Annotated[str | None, Field(description="Last day to search, same formats as `start`. Defaults to 6 days after `start` (a week).")] = None,
  day_start: Annotated[str, Field(description="Earliest local time on each day, HH:MM.")] = "09:00",
  day_end: Annotated[str, Field(description="Latest local time on each day, HH:MM; '24:00' for the end of the day.")] = "18:00",
  include_weekends: bool = False,
  timezone: TimezoneParam = None,
  limit: Annotated[int, Field(ge=1, le=50, description="Most slots to return.")] = 10,
) -> FreeTime:
  """Free windows in the user's calendars that fit `duration_minutes`, within daily hours.

  Use it to find a time for something: "when am I free for 2 hours this week?",
  "find a 30-minute slot tomorrow afternoon" (day_start='13:00'),
  "what does my Friday look like for focus time?" (start=end='fri').

  Each slot is a maximal free window, not chopped into duration-sized pieces.
  Busy time is every timed event on the user's visible calendars, except ones
  marked free and invitations they declined; tentative and unanswered
  invitations count as busy. All-day events don't block time but are listed per
  day. Nothing in the past is returned: today starts at the next quarter hour.
  At most 31 days per call.
  """
  from_minute, to_minute = _parse_clock(day_start, "day_start"), _parse_clock(day_end, "day_end")
  if to_minute <= from_minute:
    raise ToolError("`day_end` must be after `day_start`.")
  if duration_minutes > to_minute - from_minute:
    raise ToolError(f"A {duration_minutes}-minute slot can't fit between {day_start} and {day_end}.")

  async with user_session(ctx) as (session, user):
    tz = resolve_timezone(user, timezone)
    today = today_in(tz)
    first_day = parse_day(start, today)
    last_day = parse_day(end, today) if end is not None else first_day + timedelta(days=DEFAULT_FREE_TIME_DAYS - 1)
    range_start, range_end = local_window(first_day, last_day, tz, max_days=MAX_FREE_TIME_DAYS)
    events = await CalendarEventRepository.from_session(session).list_in_range(user.id, range_start, range_end, visible_only=True)

  days = daily_availability(
    busy_intervals(events),
    first_day=first_day,
    last_day=last_day,
    day_start=time(from_minute // 60, from_minute % 60),
    day_end=time((to_minute // 60) % 24, to_minute % 60),
    tz=tz,
    now=utc_now(),
    include_weekends=include_weekends,
  )
  all_day: dict[date, list[str]] = {}
  for event in events:
    if event.all_day and event.my_response != "declined":
      assert event.start_date is not None and event.end_date is not None
      first, stop = max(event.start_date, first_day), min(event.end_date, last_day + timedelta(days=1))
      for offset in range((stop - first).days):
        all_day.setdefault(first + timedelta(days=offset), []).append(event.title)

  slots = [slot for day in days for slot in day.slots(timedelta(minutes=duration_minutes))]
  return FreeTime(
    timezone=tz.key,
    slots=[FreeSlot(start=slot.start.astimezone(tz), end=slot.end.astimezone(tz), minutes=_minutes(slot.duration)) for slot in slots[:limit]],
    total_slots=len(slots),
    days=[
      FreeDay(
        day=day.day,
        free_minutes=sum(_minutes(i.duration) for i in day.free),
        longest_free_minutes=max((_minutes(i.duration) for i in day.free), default=0),
        all_day_events=all_day.get(day.day, []),
      )
      for day in days
    ],
  )


class CalendarInfo(Schema):
  name: str
  account: str = Field(description="The Google or iCloud account it belongs to.")
  can_add_events: bool
  hidden: bool = Field(description="Hidden in Bessel; its events still show in get_calendar_events.")


class Calendars(Schema):
  calendars: list[CalendarInfo]


async def list_calendars(ctx: Context) -> Calendars:
  """The user's calendars and which of them events can be added to. Use it to pick the calendar for add_calendar_events."""
  async with user_session(ctx) as (session, user):
    rows = await CalendarRepository.from_session(session).list_with_accounts_for_user(user.id)
  return Calendars(
    calendars=[
      CalendarInfo(name=calendar.name, account=account.email, can_add_events=account.can_write and calendar.writable, hidden=calendar.hidden)
      for calendar, account in rows
    ]
  )


class NewEvent(Schema):
  calendar: str = Field(description="The calendar's name, as in list_calendars.")
  title: Annotated[str, Field(min_length=1, max_length=1024)]
  day: Day
  start_time: str | None = Field(default=None, description="Local HH:MM. Leave out for an all-day event.")
  end_time: str | None = Field(default=None, description=f"Local HH:MM, later the same day. Defaults to {DEFAULT_EVENT_MINUTES} minutes after start_time.")
  last_day: Day | None = Field(default=None, description="For an all-day event over several days, its last day.")
  description: str | None = Field(default=None, max_length=8192)
  location: str | None = Field(default=None, max_length=1024)
  busy: bool | None = Field(default=None, description="Whether it blocks time. Defaults to busy for timed events and free for all-day ones.")


class AddedEvent(Schema):
  calendar: str
  title: str
  start: datetime | date


class AddedEvents(Schema):
  added: list[AddedEvent]
  already_there: list[AddedEvent] = Field(description="Events skipped because the calendar has one with the same title and start.")


def _calendar_named(name: str, rows: list[tuple[Calendar, CalendarAccount]]) -> tuple[Calendar, CalendarAccount]:
  wanted = name.strip().casefold()
  matches = [(c, a) for c, a in rows if c.name.casefold() == wanted]
  writable = [(c, a) for c, a in matches if a.can_write and c.writable]
  if len(writable) == 1:
    return writable[0]
  if len(writable) > 1:
    raise ToolError(f"Several calendars are called {name!r}, in {', '.join(a.email for _, a in writable)}.")
  if matches:
    raise ToolError(f"Events can't be added to {name!r}: it's read-only, or its account needs reconnecting in Bessel.")
  names = ", ".join(sorted({c.name for c, a in rows if a.can_write and c.writable})) or "none"
  raise ToolError(f"No calendar called {name!r}. Calendars events can be added to: {names}.")


def _timing(event: NewEvent, today: date) -> dict:
  day = parse_day(event.day, today)
  if event.start_time is None:
    if event.end_time is not None:
      raise ToolError(f"{event.title!r}: end_time needs a start_time.")
    last = parse_day(event.last_day, today) if event.last_day else day
    if last < day:
      raise ToolError(f"{event.title!r}: last_day is before day.")
    return {"start": {"date": day.isoformat()}, "end": {"date": (last + timedelta(days=1)).isoformat()}}
  if event.last_day is not None:
    raise ToolError(f"{event.title!r}: last_day is only for all-day events; a timed event ends on its own day.")
  start = _parse_clock(event.start_time, "start_time")
  end = _parse_clock(event.end_time, "end_time") if event.end_time else start + DEFAULT_EVENT_MINUTES
  if end <= start or end > 24 * 60:
    raise ToolError(f"{event.title!r}: the end must be later the same day than the start.")
  moment = datetime.combine(day, time())
  return {
    "start": {"date_time": f"{moment + timedelta(minutes=start):%Y-%m-%dT%H:%M}"},
    "end": {"date_time": f"{moment + timedelta(minutes=end):%Y-%m-%dT%H:%M}"},
  }


async def add_calendar_events(
  ctx: Context,
  events: Annotated[list[NewEvent], Field(min_length=1, max_length=MAX_NEW_EVENTS)],
  timezone: TimezoneParam = None,
) -> AddedEvents:
  """Adds events to the user's calendars, such as an appointment they mention or deadlines for a plan.

  Every event is checked before any is added, and one the calendar already has (same title and start) is skipped,
  so calling again after an error is safe. Guests are never invited. Nothing can be deleted afterwards, so confirm
  the events with the user first.
  """
  async with user_session(ctx) as (session, user):
    tz = resolve_timezone(user, timezone)
    today = today_in(tz)
    rows = await CalendarRepository.from_session(session).list_with_accounts_for_user(user.id)
    planned = []
    for event in events:
      calendar, _ = _calendar_named(event.calendar, rows)
      try:
        body = EventCreate.model_validate(
          {
            "title": event.title,
            "description": event.description,
            "location": event.location,
            "busy": event.busy if event.busy is not None else event.start_time is not None,
            "time_zone": tz.key,
            "notify_guests": False,
            "timing": {**_timing(event, today), "time_zone": tz.key},
          }
        )
      except ValidationError as e:
        raise ToolError(f"{event.title!r}: {e.errors()[0]['msg']}") from e
      planned.append((calendar, body, body.timing.to_timing().start))

    repository = CalendarEventRepository.from_session(session)
    existing: dict[UUID, set[tuple[datetime | date, str]]] = {}
    for calendar_id in {calendar.id for calendar, _, _ in planned}:
      existing[calendar_id] = await repository.titles_starting(calendar_id, [start for c, _, start in planned if c.id == calendar_id])

    redis = request_redis(ctx)
    added, skipped = [], []
    for calendar, body, start in planned:
      result = AddedEvent(calendar=calendar.name, title=(body.title or "").strip(), start=start)
      key = (start.astimezone(UTC) if isinstance(start, datetime) else start, result.title.casefold())
      if key in existing[calendar.id]:
        skipped.append(result)
        continue
      await calendar_edit_service.create_event(session, redis, user.id, calendar.id, body)
      existing[calendar.id].add(key)
      added.append(result)
  return AddedEvents(added=added, already_there=skipped)


TOOLS: list[ToolSpec] = [
  read(get_calendar_events, "Calendar events"),
  read(find_free_time, "Find free time"),
  read(list_calendars, "Calendars"),
  write(add_calendar_events, "Add calendar events", idempotent=True),
]
