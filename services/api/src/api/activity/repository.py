from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from api.common.repository.base import RepositoryBase
from api.models.activity_event import ActivityEvent


class ActivityRepository(RepositoryBase[ActivityEvent]):
  model = ActivityEvent

  async def insert_events_ignoring_duplicates(self, rows: list[dict[str, Any]]) -> int:
    """Insert event rows, skipping duplicates on (source, local_id). Returns the number inserted."""
    statement = insert(ActivityEvent).values(rows).on_conflict_do_nothing(constraint="activity_events_source_local_id_key").returning(ActivityEvent.id)
    result = await self.session.execute(statement)
    return len(result.fetchall())

  async def get_events_in_range(self, start_ts: int, end_ts: int, source: str) -> list[ActivityEvent]:
    statement = (
      select(ActivityEvent)
      .where(ActivityEvent.source == source)
      .where(ActivityEvent.ts >= start_ts)
      .where(ActivityEvent.ts < end_ts)
      .order_by(ActivityEvent.ts)
    )
    result = await self.session.execute(statement)
    return list(result.scalars().all())

  async def get_last_event_before(self, ts: int, source: str) -> ActivityEvent | None:
    """Most recent event strictly before `ts`, used to seed the state that carried into a window."""
    statement = select(ActivityEvent).where(ActivityEvent.source == source).where(ActivityEvent.ts < ts).order_by(ActivityEvent.ts.desc()).limit(1)
    result = await self.session.execute(statement)
    return result.scalars().first()

  async def get_sources(self) -> list[str]:
    """Return all known sources ordered by most recent activity."""
    result = await self.session.execute(select(ActivityEvent.source).group_by(ActivityEvent.source).order_by(func.max(ActivityEvent.ts).desc()))
    return list(result.scalars().all())
