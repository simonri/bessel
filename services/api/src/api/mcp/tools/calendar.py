import re
from datetime import date, datetime, time, timedelta
from typing import Annotated
from uuid import UUID

from mcp.server.mcpserver import Context
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field

from api.calendars.availability import busy_intervals, daily_availability
from api.calendars.providers import AttendeeResponse
from api.calendars.repository import CalendarEventRepository, CalendarPersonRepository
from api.calendars.service import calendar_service
from api.common.schemas import Schema
from api.common.utils import utc_now
from api.mcp.context import user_session
from api.mcp.dates import Day, TimezoneParam, local_window, parse_day, resolve_timezone, today_in
from api.mcp.tools.common import ToolSpec, read

MAX_CALENDAR_DAYS = 62
MAX_FREE_TIME_DAYS = 31
DEFAULT_FREE_TIME_DAYS = 7
_CLOCK = re.compile(r"^(\d{1,2}):([0-5]\d)$")


class CalendarAttendee(Schema):
  name: str | None
  email: str
  response: AttendeeResponse
  is_organizer: bool


class CalendarEvent(Schema):
  id: UUID
  title: str
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


TOOLS: list[ToolSpec] = [
  read(get_calendar_events, "Calendar events"),
  read(find_free_time, "Find free time"),
]
