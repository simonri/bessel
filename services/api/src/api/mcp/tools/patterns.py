from typing import Annotated

from mcp.server.mcpserver import Context
from pydantic import Field

from api.mcp.context import user_session
from api.mcp.dates import TimezoneParam, resolve_timezone, today_in
from api.mcp.tools.common import ToolSpec, read
from api.patterns.schemas import Patterns
from api.patterns.service import patterns_service


async def get_patterns(
  ctx: Context,
  days: Annotated[int, Field(ge=14, le=365, description="How many nights back to look, ending with last night.")] = 90,
  timezone: TimezoneParam = None,
) -> Patterns:
  """The user's own base rates and lagged effects, computed over a long window: typical sleep onset and wake,
  how both vary by weekday and lately, computer-off time against sleep onset, how gym days, late workouts,
  steps and late work go with that night's sleep onset, short nights against the next day's completed tasks,
  and task on-time rates.

  Use it instead of eyeballing raw days when reviewing a day or planning one. These are correlations in the
  user's own data, not proof of cause: treat each effect as a hypothesis to test, and check `notes` for gaps.
  An effect is only listed with at least 5 nights or days on each side.
  """
  async with user_session(ctx) as (session, user):
    tz = resolve_timezone(user, timezone)
    return await patterns_service.build(session, user.id, tz, today_in(tz), days)


TOOLS: list[ToolSpec] = [
  read(get_patterns, "Patterns"),
]
