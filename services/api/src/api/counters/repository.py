from collections.abc import Sequence
from datetime import datetime
from typing import NamedTuple
from uuid import UUID

from sqlalchemy import func, select

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.counter import Counter, CounterReset


class CounterResetStats(NamedTuple):
  last_reset_at: datetime | None
  reset_count: int


class CounterRepository(RepositoryBase[Counter], RepositoryIDMixin[Counter, UUID]):
  model = Counter

  async def list_for_user(self, user_id: UUID) -> Sequence[Counter]:
    statement = select(Counter).where(Counter.deleted_at.is_(None)).where(Counter.user_id == user_id).order_by(Counter.name)
    return await self.get_all(statement)


class CounterResetRepository(RepositoryBase[CounterReset], RepositoryIDMixin[CounterReset, UUID]):
  model = CounterReset

  async def get_stats_by_counter(self, counter_ids: Sequence[UUID]) -> dict[UUID, CounterResetStats]:
    if not counter_ids:
      return {}
    result = await self.session.execute(
      select(
        CounterReset.counter_id,
        func.max(CounterReset.created_at).label("last_reset_at"),
        func.count(CounterReset.id).label("reset_count"),
      )
      .where(CounterReset.counter_id.in_(counter_ids))
      .where(CounterReset.deleted_at.is_(None))
      .group_by(CounterReset.counter_id)
    )
    return {row.counter_id: CounterResetStats(row.last_reset_at, row.reset_count) for row in result.all()}

  async def list_for_counter(self, counter_id: UUID, *, limit: int = 100) -> Sequence[CounterReset]:
    statement = (
      select(CounterReset)
      .where(CounterReset.counter_id == counter_id)
      .where(CounterReset.deleted_at.is_(None))
      .order_by(CounterReset.created_at.desc())
      .limit(limit)
    )
    return await self.get_all(statement)

  async def get_active(self, counter_id: UUID, reset_id: UUID) -> CounterReset | None:
    statement = select(CounterReset).where(CounterReset.id == reset_id).where(CounterReset.counter_id == counter_id).where(CounterReset.deleted_at.is_(None))
    return await self.get_one_or_none(statement)
