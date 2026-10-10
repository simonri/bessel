from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from api.common.repository.base import RepositoryBase, RepositoryIDMixin, RepositoryUserMixin
from api.models.time_tracking import TimeEntry, TimeProject


class TimeProjectRepository(RepositoryBase[TimeProject], RepositoryIDMixin[TimeProject, UUID], RepositoryUserMixin[TimeProject]):
  model = TimeProject

  async def list_for_user(self, user_id: UUID) -> Sequence[TimeProject]:
    return await super().list_for_user(user_id, order_by=TimeProject.created_at)


class TimeEntryRepository(RepositoryBase[TimeEntry], RepositoryIDMixin[TimeEntry, UUID]):
  model = TimeEntry

  async def list_overlapping(self, user_id: UUID, start: datetime, end: datetime) -> Sequence[TimeEntry]:
    statement = (
      self.get_base_statement()
      .where(TimeEntry.user_id == user_id)
      .where(TimeEntry.deleted_at.is_(None))
      .where(TimeEntry.start_ts < end)
      .where(TimeEntry.end_ts > start)
      .order_by(TimeEntry.start_ts)
    )
    return await self.get_all(statement)
