from collections.abc import Sequence
from datetime import date, datetime
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
    project_id: UUID | None = None,
    tag: str | None = None,
    min_priority: int | None = None,
    due_from: date | None = None,
    due_to: date | None = None,
    has_due_date: bool | None = None,
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
    if project_id is not None:
      statement = statement.where(Task.project_id == project_id)
    if tag is not None:
      statement = statement.where(Task.tags.any(tag))
    if min_priority is not None:
      statement = statement.where(Task.priority >= min_priority)
    if due_from is not None:
      statement = statement.where(Task.due_date >= due_from)
    if due_to is not None:
      statement = statement.where(Task.due_date <= due_to)
    if has_due_date is not None:
      statement = statement.where(Task.due_date.is_not(None) if has_due_date else Task.due_date.is_(None))
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

  async def list_open_occurrences_spawned_by(self, task: Task) -> Sequence[Task]:
    """The still-open next occurrences that completing `task` created."""
    return await self.get_all(
      self.get_base_statement().where(Task.parent_task_id == task.id).where(Task.user_id == task.user_id).where(Task.status.in_(["todo", "in_progress"]))
    )

  async def detach_from_project(self, project_id: UUID, user_id: UUID) -> None:
    await self.session.execute(update(Task).where(Task.project_id == project_id).where(Task.user_id == user_id).values(project_id=None))

  async def open_counts_by_project(self, user_id: UUID) -> dict[UUID | None, int]:
    """Open (todo or in progress) tasks per project id; `None` counts tasks without a project."""
    result = await self.session.execute(
      select(Task.project_id, func.count()).where(Task.user_id == user_id, Task.status.in_(("todo", "in_progress"))).group_by(Task.project_id)
    )
    return dict(result.all())

  async def list_tags(self, user_id: UUID) -> list[str]:
    """Tags used on the user's tasks, most used first."""
    tag = func.unnest(Task.tags).label("tag")
    subquery = select(tag).where(Task.user_id == user_id, Task.tags.is_not(None)).subquery()
    result = await self.session.execute(select(subquery.c.tag).group_by(subquery.c.tag).order_by(func.count().desc()))
    return [row[0] for row in result.all()]

  async def find_recent_open_by_title(self, user_id: UUID, title: str, project_id: UUID | None, since: datetime) -> Task | None:
    """An open task with this title (any case) in this project, created since `since`."""
    statement = self.get_base_statement().where(
      Task.user_id == user_id,
      func.lower(Task.title) == title.lower(),
      Task.project_id.is_(None) if project_id is None else Task.project_id == project_id,
      Task.status.in_(("todo", "in_progress")),
      Task.created_at >= since,
    )
    return await self.get_one_or_none(statement.limit(1))


class TaskAttachmentRepository(RepositoryBase[TaskAttachment], RepositoryIDMixin[TaskAttachment, UUID]):
  model = TaskAttachment

  async def total_bytes_for_user(self, user_id: UUID) -> int:
    statement = select(func.coalesce(func.sum(TaskAttachment.size_bytes), 0)).join(Task, Task.id == TaskAttachment.task_id).where(Task.user_id == user_id)
    result = await self.session.execute(statement)
    return int(result.scalar_one())
