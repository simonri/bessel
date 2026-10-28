from datetime import datetime
from uuid import UUID

from mcp.server.mcpserver import Context
from pydantic import Field

from api.common.schemas import Schema
from api.mcp.context import user_session
from api.mcp.dates import Day, TimezoneParam, local_window, parse_day, resolve_timezone, today_in
from api.mcp.tools.common import ToolSpec, read
from api.time_tracking.repository import TimeProjectRepository
from api.time_tracking.service import TimeTrackingService

# Two months, short of the service's limit so a range across a DST change still fits.
MAX_TIME_DAYS = 61


class ProjectTime(Schema):
  project: str
  client: str | None
  archived: bool
  total_secs: int = Field(description="Logged within the range; an entry running past either end only counts its part inside.")
  hourly_rate: float | None
  currency: str | None
  earned: float | None = Field(description="Hours times the hourly rate, in `currency`; null without a rate.")


class LoggedTime(Schema):
  project: str
  start: datetime = Field(description="In the user's timezone.")
  end: datetime
  duration_secs: int
  note: str | None


class TimeTracking(Schema):
  total_secs: int
  projects: list[ProjectTime] = Field(description="Projects with time in the range, most time first.")
  entries: list[LoggedTime] = Field(description="Oldest first.")


async def get_time_tracking(ctx: Context, start: Day = "7 days ago", end: Day = "today", timezone: TimezoneParam = None) -> TimeTracking:
  """Hours the user logged against client projects in Bessel's time tracker: totals and earnings per project, and each entry.

  E.g. "how many hours did I bill Acme in September" or "what did I work on last week". At most 61 days at a time.
  """
  async with user_session(ctx) as (session, user):
    tz = resolve_timezone(user, timezone)
    today = today_in(tz)
    window_start, window_end = local_window(parse_day(start, today), parse_day(end, today), tz, max_days=MAX_TIME_DAYS)
    entries = await TimeTrackingService().list_entries(session, user.id, window_start, window_end)
    projects = {p.id: p for p in await TimeProjectRepository.from_session(session).list_for_user(user.id)}

  seconds: dict[UUID, float] = {}
  for entry in entries:
    inside = min(entry.end_ts, window_end) - max(entry.start_ts, window_start)
    seconds[entry.time_project_id] = seconds.get(entry.time_project_id, 0.0) + inside.total_seconds()

  def name_of(project_id: UUID) -> str:
    project = projects.get(project_id)
    return project.name if project else "(deleted project)"

  totals = []
  for project_id, secs in seconds.items():
    project = projects.get(project_id)
    rate = float(project.hourly_rate) if project and project.hourly_rate is not None else None
    totals.append(
      ProjectTime(
        project=name_of(project_id),
        client=project.client if project else None,
        archived=project is None or project.archived_at is not None,
        total_secs=round(secs),
        hourly_rate=rate,
        currency=project.currency if project else None,
        earned=round(secs / 3600 * rate, 2) if rate is not None else None,
      )
    )
  return TimeTracking(
    total_secs=round(sum(seconds.values())),
    projects=sorted(totals, key=lambda p: p.total_secs, reverse=True),
    entries=[
      LoggedTime(
        project=name_of(e.time_project_id),
        start=e.start_ts.astimezone(tz),
        end=e.end_ts.astimezone(tz),
        duration_secs=round((e.end_ts - e.start_ts).total_seconds()),
        note=e.note,
      )
      for e in entries
    ],
  )


TOOLS: list[ToolSpec] = [
  read(get_time_tracking, "Time tracking"),
]
