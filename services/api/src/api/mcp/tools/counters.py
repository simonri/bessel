from datetime import datetime
from uuid import UUID

from mcp.server.mcpserver import Context
from pydantic import Field

from api.common.schemas import Schema
from api.common.utils import utc_now
from api.counters.repository import CounterRepository, CounterResetRepository
from api.mcp.context import user_session
from api.mcp.dates import TimezoneParam, resolve_timezone
from api.mcp.tools.common import ToolSpec, read

RECENT_RESETS = 5


class DaysSince(Schema):
  id: UUID
  name: str
  created_at: datetime = Field(description="In the user's timezone.")
  last_reset_at: datetime | None = Field(description="Null when it was never reset.")
  days_since: int | None = Field(description="Whole days since the last reset; null when it was never reset.")
  reset_count: int
  recent_resets: list[datetime] = Field(description=f"The last {RECENT_RESETS} resets, newest first.")


class Counters(Schema):
  counters: list[DaysSince] = Field(description="By name.")


async def get_counters(ctx: Context, timezone: TimezoneParam = None) -> Counters:
  """The user's "days since" counters: how long since each was last reset, e.g. a habit streak or the last time something happened.

  Gaps between recent resets show how often it happens.
  """
  async with user_session(ctx) as (session, user):
    tz = resolve_timezone(user, timezone)
    counters = await CounterRepository.from_session(session).list_for_user(user.id)
    resets = CounterResetRepository.from_session(session)
    stats = await resets.get_stats_by_counter([c.id for c in counters])
    recent = await resets.recent_by_counter([c.id for c in counters], per_counter=RECENT_RESETS)

  now = utc_now()
  result = []
  for counter in counters:
    last, count = stats[counter.id] if counter.id in stats else (None, 0)
    result.append(
      DaysSince(
        id=counter.id,
        name=counter.name,
        created_at=counter.created_at.astimezone(tz),
        last_reset_at=last.astimezone(tz) if last else None,
        days_since=(now - last).days if last else None,
        reset_count=count,
        recent_resets=[at.astimezone(tz) for at in recent.get(counter.id, [])],
      )
    )
  return Counters(counters=result)


TOOLS: list[ToolSpec] = [
  read(get_counters, "Days-since counters"),
]
