from typing import Any
from uuid import UUID

from api.common.utils import utc_now
from api.models.project import Project
from api.models.task import Task
from api.postgres import AsyncSession
from api.projects.repository import ProjectRepository
from api.tasks.attachment_storage import delete_attachment_file
from api.tasks.recurrence import compute_next_due_date
from api.tasks.repository import TaskRepository
from api.tasks.schemas import TaskCreate


class TaskService:
  async def resolve_project(self, session: AsyncSession, name: str | None, user_id: UUID) -> Project | None:
    """The user's project called `name`, created if it doesn't exist yet."""
    if name is None:
      return None
    repo = ProjectRepository.from_session(session)
    project = await repo.get_by_name(name, user_id=user_id)
    if project is None:
      project = await repo.create(Project(name=name, user_id=user_id), flush=True)
    return project

  async def create(self, session: AsyncSession, user_id: UUID, body: TaskCreate) -> Task:
    repo = TaskRepository.from_session(session)
    task_data = body.model_dump()
    project = await self.resolve_project(session, task_data.pop("project", None), user_id)
    task_data["project_id"] = project.id if project else None
    task_data["user_id"] = user_id
    if task_data.get("position") is None:
      max_pos = await repo.get_max_position(user_id)
      task_data["position"] = (max_pos or 0) + 1000
    task = Task(**task_data)
    task.project_obj = project
    # A freshly constructed (never queried) object's relationships are
    # "unloaded" rather than known-empty — reading .attachments later would
    # otherwise trigger a synchronous lazy-load, which errors under asyncio.
    task.attachments = []
    await repo.create(task, flush=True)
    return task

  async def update(self, session: AsyncSession, task: Task, changes: dict[str, Any]) -> Task:
    """Applies `changes` (TaskUpdate fields that were set) to `task`."""
    changes = dict(changes)
    if "project" in changes:
      project = await self.resolve_project(session, changes.pop("project"), task.user_id)
      changes["project_id"] = project.id if project else None
      task.project_obj = project
    if changes:
      await TaskRepository.from_session(session).update(task, update_dict=changes, flush=True)
    return task

  async def complete(self, session: AsyncSession, task: Task) -> Task | None:
    """Marks `task` done and returns the next occurrence it spawned, for a recurring task."""
    repo = TaskRepository.from_session(session)
    # Idempotency: a duplicate complete (double click, client retry) must not
    # re-stamp completed_at or spawn another recurring instance.
    if task.status == "done":
      return None
    await repo.update(task, update_dict={"status": "done", "completed_at": utc_now()}, flush=True)
    if not (task.is_recurring and task.rrule_frequency):
      return None
    next_due = compute_next_due_date(
      current_due=task.due_date,
      frequency=task.rrule_frequency,
      interval=task.rrule_interval or 1,
      day_of_week=task.rrule_day_of_week,
      day_of_month=task.rrule_day_of_month,
    )
    max_pos = await repo.get_max_position(task.user_id)
    next_task = Task(
      title=task.title,
      description=task.description,
      status="todo",
      priority=task.priority,
      due_date=next_due,
      project_id=task.project_id,
      area=task.area,
      tags=task.tags,
      position=(max_pos or 0) + 1000,
      is_recurring=True,
      rrule_frequency=task.rrule_frequency,
      rrule_interval=task.rrule_interval,
      rrule_day_of_week=task.rrule_day_of_week,
      rrule_day_of_month=task.rrule_day_of_month,
      parent_task_id=task.id,
      user_id=task.user_id,
    )
    next_task.project_obj = task.project_obj
    next_task.attachments = []
    await repo.create(next_task, flush=True)
    return next_task

  async def undo_complete(self, session: AsyncSession, task: Task) -> Task:
    """Reopens `task` and removes the next occurrence completing it spawned, so
    an undo can't leave a routine both reopened and repeated."""
    repo = TaskRepository.from_session(session)
    # Idempotency: undoing twice must not delete an occurrence spawned later.
    if task.status != "done":
      return task
    for occurrence in await repo.list_open_occurrences_spawned_by(task):
      attachment_ids = [attachment.id for attachment in occurrence.attachments]
      await repo.delete(occurrence)
      for attachment_id in attachment_ids:
        await delete_attachment_file(attachment_id)
    await repo.update(task, update_dict={"status": "todo", "completed_at": None}, flush=True)
    return task


task_service = TaskService()
