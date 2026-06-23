from uuid import UUID

from sqlalchemy import func, select

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.task import Task


class TaskRepository(RepositoryBase[Task], RepositoryIDMixin[Task, UUID]):
  model = Task

  async def get_max_position(self) -> float | None:
    result = await self.session.execute(select(func.max(Task.position)))
    return result.scalar()
