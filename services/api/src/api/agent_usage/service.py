from typing import Any

from api.agent_usage.repository import AgentUsageDailyRepository, AgentUsageStatusRepository
from api.agent_usage.schemas import AgentUsageSyncRequest
from api.common.utils import utc_now


class AgentUsageService:
  # user_id is deliberately never set here: rows land with user_id NULL,
  # same as ActivityEvent, and get attached to the real user by
  # UserRepository.claim_orphaned_data on next login.
  async def sync(
    self,
    daily_repo: AgentUsageDailyRepository,
    status_repo: AgentUsageStatusRepository,
    request: AgentUsageSyncRequest,
  ) -> tuple[int, int]:
    # Keyed by the unique constraint: a batch that repeats a key (e.g. the
    # collector resending overlapping days) must not touch the same row
    # twice in one upsert statement, which Postgres rejects outright.
    daily_rows: dict[tuple[str, str, Any, str], dict[str, Any]] = {}
    for upload in request.daily:
      for entry in upload.models:
        key = (upload.device, upload.agent, upload.date, entry.model)
        daily_rows[key] = {
          "device": upload.device,
          "agent": upload.agent,
          "date": upload.date,
          "model": entry.model,
          "input_tokens": entry.input_tokens,
          "output_tokens": entry.output_tokens,
          "cache_read_tokens": entry.cache_read_tokens,
          "cache_creation_tokens": entry.cache_creation_tokens,
        }

    now = utc_now()
    status_rows: dict[tuple[str, str, str], dict[str, Any]] = {}
    for rate_limit in request.rate_limits:
      key = (rate_limit.device, rate_limit.agent, rate_limit.window_label)
      status_rows[key] = {
        "device": rate_limit.device,
        "agent": rate_limit.agent,
        "window_label": rate_limit.window_label,
        "utilization_pct": rate_limit.utilization_pct,
        "resets_at": rate_limit.resets_at,
        "tier": rate_limit.tier,
        "observed_at": now,
      }

    daily_synced = await daily_repo.upsert_all(list(daily_rows.values()))
    status_synced = await status_repo.upsert_all(list(status_rows.values()))
    return daily_synced, status_synced


agent_usage_service = AgentUsageService()
