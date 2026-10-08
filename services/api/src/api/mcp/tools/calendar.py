from datetime import date, datetime, time
from uuid import UUID

from mcp.server.mcpserver import Context
from pydantic import Field

from api.calendars.providers import AttendeeResponse
from api.calendars.repository import CalendarEventRepository, CalendarPersonRepository
from api.calendars.service import calendar_service
from api.common.schemas import Schema
from api.mcp.context import user_session
from api.mcp.dates import Day, TimezoneParam, local_window, parse_day, resolve_timezone, today_in
from api.mcp.tools.common import ToolSpec, read

MAX_CALENDAR_DAYS = 62


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


TOOLS: list[ToolSpec] = [
  read(get_calendar_events, "Calendar events"),
]
