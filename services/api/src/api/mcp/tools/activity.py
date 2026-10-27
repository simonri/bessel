from datetime import datetime
from typing import Annotated

from mcp.server.mcpserver import Context
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field

from api.activity.repository import ActivityRepository
from api.activity.schemas import ActivitySummaryResponse
from api.activity.service import ActivityService
from api.common.schemas import Schema
from api.mcp.context import user_session
from api.mcp.dates import Day, TimezoneParam, local_window, parse_day, resolve_timezone, today_in
from api.mcp.tools.common import ToolSpec, read

MAX_ACTIVITY_DAYS = 31


class ActivePeriod(Schema):
  start: datetime
  end: datetime


class ComputerActivity(ActivitySummaryResponse):
  periods: list[ActivePeriod] = Field(
    description="When the computer was in use, oldest first; a break of over 30 minutes starts a new period. In the user's timezone."
  )


async def get_computer_activity(
  ctx: Context,
  start: Day = "today",
  end: Day = "today",
  timezone: TimezoneParam = None,
  source: Annotated[str | None, Field(description="Which computer to report on. Defaults to the most recently active one.")] = None,
) -> ComputerActivity:
  """Active time at the computer per application, and the periods it was in use, from the desktop activity tracker.

  E.g. "how long did I code today", or when the user stopped last night: start="yesterday" end="today" and read the
  end of the last period that runs into the night.
  """
  async with user_session(ctx) as (session, user):
    tz = resolve_timezone(user, timezone)
    today = today_in(tz)
    window_start, window_end = local_window(parse_day(start, today), parse_day(end, today), tz, max_days=MAX_ACTIVITY_DAYS)
    repo = ActivityRepository.from_session(session)
    if source is None:
      sources = await repo.get_sources(user.id)
      if not sources:
        raise ToolError("No computer activity has been recorded.")
      source = sources[0]
    service = ActivityService()
    segments = await service.get_active_segments(repo, user.id, source, int(window_start.timestamp()), int(window_end.timestamp()))
    summary = service.summarize_segments(source, await repo.get_sources(user.id), segments)
  periods = [
    ActivePeriod(start=datetime.fromtimestamp(start_ts, tz), end=datetime.fromtimestamp(end_ts, tz)) for start_ts, end_ts in service.active_periods(segments)
  ]
  return ComputerActivity(**summary.model_dump(), periods=periods)


TOOLS: list[ToolSpec] = [
  read(get_computer_activity, "Computer activity"),
]
