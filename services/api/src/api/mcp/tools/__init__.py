"""Tools exposed over MCP, one module per area.

Each tool resolves the caller from the bearer token via `user_session` and goes
through the same repositories and services as the REST endpoints. Tools never
delete anything.
"""

from api.mcp.tools import activity, calendar, health, recipes, tasks
from api.mcp.tools.common import ToolSpec

TOOLS: list[ToolSpec] = [
  *tasks.TOOLS,
  *calendar.TOOLS,
  *recipes.TOOLS,
  *health.TOOLS,
  *activity.TOOLS,
]
