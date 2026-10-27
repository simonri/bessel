"""Tools exposed over MCP, one module per area.

Each tool resolves the caller from the bearer token via `user_session` and goes
through the same repositories and services as the REST endpoints. Tools never
delete anything, and money is only ever read.
"""

from api.mcp.tools import activity, calendar, contacts, health, money, notes, recipes, tasks, weather
from api.mcp.tools.common import ToolSpec

TOOLS: list[ToolSpec] = [
  *tasks.TOOLS,
  *calendar.TOOLS,
  *recipes.TOOLS,
  *contacts.TOOLS,
  *health.TOOLS,
  *activity.TOOLS,
  *money.TOOLS,
  *weather.TOOLS,
  *notes.TOOLS,
]
