from datetime import date, datetime

from mcp.server.mcpserver import Context
from pydantic import Field

from api.agent_usage.repository import AgentUsageDailyRepository, AgentUsageStatusRepository
from api.common.schemas import Schema
from api.mcp.context import user_session
from api.mcp.dates import Day, TimezoneParam, local_window, parse_day, resolve_timezone, today_in
from api.mcp.tools.common import ToolSpec, read
from api.models.agent_usage_daily import AgentUsageDaily

MAX_USAGE_DAYS = 92


class Tokens(Schema):
  input_tokens: int = 0
  output_tokens: int = 0
  cache_read_tokens: int = 0
  cache_creation_tokens: int = 0

  def add(self, row: AgentUsageDaily) -> None:
    self.input_tokens += row.input_tokens
    self.output_tokens += row.output_tokens
    self.cache_read_tokens += row.cache_read_tokens
    self.cache_creation_tokens += row.cache_creation_tokens


class UsageDay(Tokens):
  date: date


class ModelUsage(Tokens):
  agent: str = Field(description="E.g. claude-code.")
  model: str


class RateLimit(Schema):
  device: str
  agent: str
  window: str = Field(description="E.g. session_5h or week.")
  utilization_pct: float
  resets_at: datetime | None
  tier: str | None
  observed_at: datetime = Field(description="When the desktop app last reported it.")


class AgentUsage(Schema):
  total: Tokens
  days: list[UsageDay] = Field(description="Oldest first; a day without use is missing.")
  models: list[ModelUsage] = Field(description="Most output first.")
  devices: list[str]
  rate_limits: list[RateLimit] = Field(description="The latest reported plan limits, whatever the range.")


async def get_agent_usage(ctx: Context, start: Day = "7 days ago", end: Day = "today", timezone: TimezoneParam = None) -> AgentUsage:
  """The user's own AI coding agent use (Claude Code), as reported by the Bessel desktop app: tokens per day and model, and how
  much of the plan's rate limits is used.

  A day is the local day on the computer that did the work.
  """
  async with user_session(ctx) as (session, user):
    tz = resolve_timezone(user, timezone)
    first, last = parse_day(start, today_in(tz)), parse_day(end, today_in(tz))
    local_window(first, last, tz, max_days=MAX_USAGE_DAYS)
    rows = await AgentUsageDailyRepository.from_session(session).get_entries(user.id, first, last)
    limits = await AgentUsageStatusRepository.from_session(session).get_latest(user.id)

  total = Tokens()
  days: dict[date, UsageDay] = {}
  models: dict[tuple[str, str], ModelUsage] = {}
  for row in rows:
    total.add(row)
    days.setdefault(row.date, UsageDay(date=row.date)).add(row)
    models.setdefault((row.agent, row.model), ModelUsage(agent=row.agent, model=row.model)).add(row)
  return AgentUsage(
    total=total,
    days=[days[day] for day in sorted(days)],
    models=sorted(models.values(), key=lambda m: m.output_tokens, reverse=True),
    devices=sorted({row.device for row in rows}),
    rate_limits=[
      RateLimit(
        device=s.device,
        agent=s.agent,
        window=s.window_label,
        utilization_pct=s.utilization_pct,
        resets_at=s.resets_at,
        tier=s.tier,
        observed_at=s.observed_at,
      )
      for s in limits
    ],
  )


TOOLS: list[ToolSpec] = [
  read(get_agent_usage, "Agent usage"),
]
