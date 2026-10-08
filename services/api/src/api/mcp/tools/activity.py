from typing import Annotated

from mcp.server.mcpserver import Context
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field

from api.activity.repository import ActivityRepository
from api.activity.schemas import ActivitySummaryResponse
from api.activity.service import ActivityService
from api.mcp.context import user_session
from api.mcp.dates import Day, TimezoneParam, local_window, parse_day, resolve_timezone, today_in
from api.mcp.tools.common import ToolSpec, read

MAX_ACTIVITY_DAYS = 31


class ComputerActivity(ActivitySummaryResponse):
  pass


async def get_computer_activity(
  ctx: Context,
  start: Day = "today",
  end: Day = "today",
  timezone: TimezoneParam = None,
  source: Annotated[str | None, Field(description="Which computer to report on. Defaults to the most recently active one.")] = None,
) -> ComputerActivity:
  """Active time at the computer per application, from the desktop activity tracker, e.g. "how long did I code today"."""
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
    summary = await ActivityService().summarize(repo, user.id, source, int(window_start.timestamp()), int(window_end.timestamp()))
  return ComputerActivity.model_validate(summary.model_dump())


TOOLS: list[ToolSpec] = [
  read(get_computer_activity, "Computer activity"),
]
