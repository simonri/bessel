from collections.abc import Sequence
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from api.common.repository.base import RepositoryBase
from api.models.agent_usage_daily import AgentUsageDaily
from api.models.agent_usage_status import AgentUsageStatus


class AgentUsageDailyRepository(RepositoryBase[AgentUsageDaily]):
  model = AgentUsageDaily

  async def upsert_all(self, rows: list[dict[str, Any]]) -> int:
    if not rows:
      return 0
    statement = pg_insert(AgentUsageDaily).values(rows)
    statement = statement.on_conflict_do_update(
      # user_id is intentionally excluded from the update: it starts NULL
      # (set only on first insert) and gets claimed by UserRepository.claim_orphaned_data
      # on next login. Re-syncing the same row later must not stomp that claim back to NULL.
      index_elements=["device", "agent", "date", "model"],
      set_={
        "input_tokens": statement.excluded.input_tokens,
        "output_tokens": statement.excluded.output_tokens,
        "cache_read_tokens": statement.excluded.cache_read_tokens,
        "cache_creation_tokens": statement.excluded.cache_creation_tokens,
      },
    )
    result = await self.session.execute(statement)
    return result.rowcount or 0

  async def get_entries(self, start_date: date, end_date: date) -> Sequence[AgentUsageDaily]:
    statement = (
      select(AgentUsageDaily)
      .where(AgentUsageDaily.date >= start_date)
      .where(AgentUsageDaily.date <= end_date)
      .where(AgentUsageDaily.deleted_at.is_(None))
      .order_by(AgentUsageDaily.date)
    )
    return await self.get_all(statement)


class AgentUsageStatusRepository(RepositoryBase[AgentUsageStatus]):
  model = AgentUsageStatus

  async def upsert_all(self, rows: list[dict[str, Any]]) -> int:
    if not rows:
      return 0
    statement = pg_insert(AgentUsageStatus).values(rows)
    statement = statement.on_conflict_do_update(
      # See AgentUsageDailyRepository.upsert_all: user_id is excluded here too,
      # for the same claim-preservation reason.
      index_elements=["device", "agent", "window_label"],
      set_={
        "utilization_pct": statement.excluded.utilization_pct,
        "resets_at": statement.excluded.resets_at,
        "tier": statement.excluded.tier,
        "observed_at": statement.excluded.observed_at,
      },
    )
    result = await self.session.execute(statement)
    return result.rowcount or 0

  async def get_latest(self) -> Sequence[AgentUsageStatus]:
    statement = select(AgentUsageStatus).where(AgentUsageStatus.deleted_at.is_(None)).order_by(AgentUsageStatus.device, AgentUsageStatus.agent)
    return await self.get_all(statement)
