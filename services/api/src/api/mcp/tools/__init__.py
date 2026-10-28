"""Tools exposed over MCP, one module per area.

Each tool resolves the caller from the bearer token via `user_session` and goes
through the same repositories and services as the REST endpoints. Tools never
delete anything, and money is only ever read.
"""

from api.mcp.tools import (
  activity,
  agent_usage,
  calendar,
  contacts,
  counters,
  health,
  location,
  memory,
  money,
  notes,
  patterns,
  recipes,
  tasks,
  time_tracking,
  weather,
)
from api.mcp.tools.common import ToolSpec

TOOLS: list[ToolSpec] = [
  *memory.TOOLS,
  *tasks.TOOLS,
  *calendar.TOOLS,
  *recipes.TOOLS,
  *contacts.TOOLS,
  *health.TOOLS,
  *activity.TOOLS,
  *patterns.TOOLS,
  *location.TOOLS,
  *time_tracking.TOOLS,
  *agent_usage.TOOLS,
  *counters.TOOLS,
  *money.TOOLS,
  *weather.TOOLS,
  *notes.TOOLS,
]
