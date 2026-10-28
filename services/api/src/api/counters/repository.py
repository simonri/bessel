from collections.abc import Sequence
from datetime import datetime
from typing import NamedTuple
from uuid import UUID

from sqlalchemy import func, select

from api.common.repository.base import RepositoryBase, RepositoryIDMixin, RepositoryUserMixin
from api.models.counter import Counter, CounterReset


class CounterResetStats(NamedTuple):
  last_reset_at: datetime | None
  reset_count: int


class CounterRepository(RepositoryBase[Counter], RepositoryIDMixin[Counter, UUID], RepositoryUserMixin[Counter]):
  model = Counter

  async def list_for_user(self, user_id: UUID) -> Sequence[Counter]:
    return await super().list_for_user(user_id, order_by=Counter.name)


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

  async def recent_by_counter(self, counter_ids: Sequence[UUID], *, per_counter: int) -> dict[UUID, list[datetime]]:
    """The latest `per_counter` reset times of each counter, newest first."""
    if not counter_ids:
      return {}
    rank = func.row_number().over(partition_by=CounterReset.counter_id, order_by=CounterReset.created_at.desc()).label("rank")
    ranked = (
      select(CounterReset.counter_id, CounterReset.created_at, rank)
      .where(CounterReset.counter_id.in_(counter_ids))
      .where(CounterReset.deleted_at.is_(None))
      .subquery()
    )
    result = await self.session.execute(
      select(ranked.c.counter_id, ranked.c.created_at).where(ranked.c.rank <= per_counter).order_by(ranked.c.counter_id, ranked.c.created_at.desc())
    )
    recent: dict[UUID, list[datetime]] = {}
    for counter_id, created_at in result.all():
      recent.setdefault(counter_id, []).append(created_at)
    return recent

  async def get_active(self, counter_id: UUID, reset_id: UUID) -> CounterReset | None:
    statement = select(CounterReset).where(CounterReset.id == reset_id).where(CounterReset.counter_id == counter_id).where(CounterReset.deleted_at.is_(None))
    return await self.get_one_or_none(statement)
