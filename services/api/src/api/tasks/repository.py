from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import Select, func, select, update

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.project import Project
from api.models.task import Task
from api.models.task_attachment import TaskAttachment


class TaskRepository(RepositoryBase[Task], RepositoryIDMixin[Task, UUID]):
  model = Task

  def get_filtered_statement(
    self,
    user_id: UUID,
    *,
    statuses: Sequence[str] | None = None,
    priority: int | None = None,
    project: str | None = None,
    area: str | None = None,
    is_recurring: bool | None = None,
    completed_after: datetime | None = None,
    completed_before: datetime | None = None,
    search: str | None = None,
  ) -> Select[tuple[Task]]:
    statement = self.get_base_statement().where(Task.user_id == user_id)
    if statuses is not None:
      statement = statement.where(Task.status.in_(statuses))
    if priority is not None:
      statement = statement.where(Task.priority == priority)
    if project is not None:
      project_ids = select(Project.id).where(Project.user_id == user_id, Project.name == project, Project.deleted_at.is_(None))
      statement = statement.where(Task.project_id.in_(project_ids))
    if area is not None:
      statement = statement.where(Task.area == area)
    if is_recurring is not None:
      statement = statement.where(Task.is_recurring == is_recurring)
    if completed_after is not None:
      statement = statement.where(Task.completed_at >= completed_after)
    if completed_before is not None:
      statement = statement.where(Task.completed_at < completed_before)
    if search:
      statement = statement.where(Task.title.ilike(f"%{search}%") | Task.description.ilike(f"%{search}%"))
    return statement

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


class TaskAttachmentRepository(RepositoryBase[TaskAttachment], RepositoryIDMixin[TaskAttachment, UUID]):
  model = TaskAttachment

  async def total_bytes_for_user(self, user_id: UUID) -> int:
    statement = select(func.coalesce(func.sum(TaskAttachment.size_bytes), 0)).join(Task, Task.id == TaskAttachment.task_id).where(Task.user_id == user_id)
    result = await self.session.execute(statement)
    return int(result.scalar_one())
