from sqlalchemy import func, select

from api.common.repository.base import RepositoryBase
from api.models.activity_event import ActivityEvent


class ActivityRepository(RepositoryBase[ActivityEvent]):
    model = ActivityEvent

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

    async def get_sources(self) -> list[str]:
        """Return all known sources ordered by most recent activity."""
        result = await self.session.execute(
            select(ActivityEvent.source)
            .group_by(ActivityEvent.source)
            .order_by(func.max(ActivityEvent.ts).desc())
        )
        return list(result.scalars().all())
