import datetime

from pydantic import Field

from api.common.schemas import Schema

AGENT_USAGE_MAX_BATCH = 200


class AgentUsageModelTokens(Schema):
  model: str = Field(max_length=100)
  input_tokens: int = Field(ge=0)
  output_tokens: int = Field(ge=0)
  cache_read_tokens: int = Field(ge=0)
  cache_creation_tokens: int = Field(ge=0)


class AgentUsageDailyUpload(Schema):
  device: str = Field(max_length=100, description="Machine identifier, e.g. hostname.")
  agent: str = Field(max_length=50, description="e.g. 'claude-code'.")
  date: datetime.date = Field(description="Collector's local calendar date.")
  models: list[AgentUsageModelTokens]


class AgentUsageRateLimitUpload(Schema):
  device: str = Field(max_length=100)
  agent: str = Field(max_length=50)
  window_label: str = Field(max_length=50, description="e.g. 'session_5h', 'week'.")
  utilization_pct: float = Field(ge=0, le=100)
  resets_at: datetime.datetime | None = None
  tier: str | None = Field(default=None, max_length=50)


class AgentUsageSyncRequest(Schema):
  daily: list[AgentUsageDailyUpload] = Field(default_factory=list, max_length=AGENT_USAGE_MAX_BATCH)
  rate_limits: list[AgentUsageRateLimitUpload] = Field(default_factory=list, max_length=AGENT_USAGE_MAX_BATCH)


class AgentUsageSyncResponse(Schema):
  daily_synced: int = Field(description="Number of (device, agent, date, model) rows inserted or updated.")
  status_synced: int = Field(description="Number of (device, agent, window_label) rows inserted or updated.")


class AgentUsageDailyEntry(Schema):
  date: str = Field(description="ISO date string (YYYY-MM-DD).")
  device: str
  agent: str
  model: str
  input_tokens: int
  output_tokens: int
  cache_read_tokens: int
  cache_creation_tokens: int


class AgentUsageDailyResponse(Schema):
  entries: list[AgentUsageDailyEntry]


class AgentUsageStatusEntry(Schema):
  device: str
  agent: str
  window_label: str
  utilization_pct: float
  resets_at: datetime.datetime | None
  tier: str | None
  observed_at: datetime.datetime


class AgentUsageStatusResponse(Schema):
  entries: list[AgentUsageStatusEntry]
