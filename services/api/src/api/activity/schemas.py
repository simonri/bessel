from pydantic import Field

from api.common.schemas import Schema


class ActivityEventIn(Schema):
  local_id: int = Field(description="Original SQLite id from the source machine.")
  ts: int = Field(description="Unix epoch seconds (UTC) when the event was recorded.")
  state: str = Field(description="'active' or 'idle'.")
  app_class: str | None = Field(default=None, description="Window class / app identifier.")
  title: str | None = Field(default=None, description="Window title.")
  workspace: str | None = Field(default=None, description="Workspace name or number.")


class ActivityBatchRequest(Schema):
  source: str = Field(description="Machine identifier, e.g. hostname.")
  events: list[ActivityEventIn] = Field(description="Batch of events to ingest.")


class ActivityBatchResponse(Schema):
  inserted: int = Field(description="Number of new events inserted.")
  skipped: int = Field(description="Number of duplicate events skipped.")


class ActivityAppSummary(Schema):
  app_class: str = Field(description="Window class / app identifier.")
  active_secs: int = Field(description="Total active seconds attributed to this app.")
  percentage: float = Field(description="Share of total active time (0–100).")


class ActivitySummaryResponse(Schema):
  source: str = Field(description="Machine source that was queried.")
  sources: list[str] = Field(description="All known machine sources, ordered by most recent activity.")
  total_active_secs: int = Field(description="Total active seconds in the requested time window.")
  apps: list[ActivityAppSummary] = Field(description="Per-app breakdown, sorted by active time descending.")


class ActivitySourcesResponse(Schema):
  sources: list[str] = Field(description="All known machine sources, ordered by most recent activity.")


class ActivityDailyEntry(Schema):
  date: str = Field(description="ISO date string (YYYY-MM-DD).")
  active_secs: int = Field(description="Total active seconds for the day.")


class ActivityDailyResponse(Schema):
  days: list[ActivityDailyEntry] = Field(description="Per-day totals, sorted ascending by date. Days with no activity are omitted.")


class ActivityIntradayBucket(Schema):
  bucket: int = Field(description="Bucket index from midnight (0-based). Each bucket spans bucket_mins minutes.")
  active_secs: int = Field(description="Total active seconds in this bucket.")


class ActivityIntradayResponse(Schema):
  bucket_mins: int = Field(description="Duration of each bucket in minutes.")
  total_buckets: int = Field(description="Total number of buckets covering the requested window.")
  buckets: list[ActivityIntradayBucket] = Field(description="Buckets with activity, sorted ascending. Buckets with no activity are omitted.")
