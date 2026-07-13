from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select, update

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.task import Task


class TaskRepository(RepositoryBase[Task], RepositoryIDMixin[Task, UUID]):
  model = Task

  async def get_max_position(self, user_id: UUID) -> float | None:
    result = await self.session.execute(select(func.max(Task.position)).where(Task.user_id == user_id))
    return result.scalar()

  async def list_by_ids_for_user(self, task_ids: Sequence[UUID], user_id: UUID) -> Sequence[Task]:
    return await self.get_all(self.get_base_statement().where(Task.id.in_(task_ids)).where(Task.user_id == user_id))

  async def detach_from_project(self, project_id: UUID, user_id: UUID) -> None:
    await self.session.execute(update(Task).where(Task.project_id == project_id).where(Task.user_id == user_id).values(project_id=None))

  async def list_areas_by_usage(self, user_id: UUID) -> list[str]:
    result = await self.session.execute(
      select(Task.area).where(Task.area.is_not(None)).where(Task.user_id == user_id).group_by(Task.area).order_by(func.count().desc())
    )
    return [row[0] for row in result.all()]
