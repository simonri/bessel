from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select

from api.common.pagination import PaginationParamsQuery
from api.common.sorting import Sorting, SortingGetter
from api.common.utils import utc_now
from api.exceptions import ResourceNotFound
from api.models.project import Project
from api.models.task import Task
from api.postgres import AsyncSession, get_db_session
from api.projects.repository import ProjectRepository
from api.tasks.recurrence import compute_next_due_date
from api.tasks.repository import TaskRepository
from api.tasks.schemas import TaskCompleteResponse, TaskCreate, TaskListResponse, TaskReorderItem, TaskSchema, TaskStatus, TaskUpdate
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/tasks", tags=["tasks"])


class TaskSortProperty(StrEnum):
  created_at = "created_at"
  due_date = "due_date"
  priority = "priority"
  title = "title"
  completed_at = "completed_at"
  position = "position"


sorting_getter = SortingGetter(TaskSortProperty, default_sorting=["-created_at"])


async def _resolve_project(session: AsyncSession, name: str | None, user_id: UUID) -> Project | None:
  if name is None:
    return None
  repo = ProjectRepository.from_session(session)
  project = await repo.get_by_name(name, user_id=user_id)
  if project is None:
    project = await repo.create(Project(name=name, user_id=user_id), flush=True)
  return project


async def _get_task_or_404(session: AsyncSession, task_id: UUID, user_id: UUID) -> Task:
  repo = TaskRepository.from_session(session)
  task = await repo.get_by_id(task_id)
  if task is None or task.user_id != user_id:
    raise ResourceNotFound("Task not found")
  return task


@router.get(
  "",
  summary="List Tasks",
  response_model=TaskListResponse,
)
async def list_tasks(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  pagination: PaginationParamsQuery,
  sorting: Annotated[list[Sorting[TaskSortProperty]], Depends(sorting_getter)],
  status: TaskStatus | None = Query(default=None, description="Filter by status."),
  priority: int | None = Query(default=None, ge=0, le=4, description="Filter by priority."),
  project: str | None = Query(default=None, description="Filter by project."),
  area: str | None = Query(default=None, description="Filter by area."),
  is_recurring: bool | None = Query(default=None, description="Filter by recurring."),
  completed_after: int | None = Query(default=None, description="Filter tasks completed after this Unix timestamp (inclusive)."),
  completed_before: int | None = Query(default=None, description="Filter tasks completed before this Unix timestamp (exclusive)."),
) -> TaskListResponse:
  repo = TaskRepository.from_session(session)
  statement = repo.get_base_statement().where(Task.user_id == current_user.id)

  if status is not None:
    statement = statement.where(Task.status == status)
  if priority is not None:
    statement = statement.where(Task.priority == priority)
  if project is not None:
    project_subq = (
      select(Project.id).where(Project.name == project).where(Project.deleted_at.is_(None)).where(Project.user_id == current_user.id).scalar_subquery()
    )
    statement = statement.where(Task.project_id == project_subq)
  if area is not None:
    statement = statement.where(Task.area == area)
  if is_recurring is not None:
    statement = statement.where(Task.is_recurring == is_recurring)
  if completed_after is not None:
    statement = statement.where(Task.completed_at >= datetime.fromtimestamp(completed_after, tz=UTC))
  if completed_before is not None:
    statement = statement.where(Task.completed_at < datetime.fromtimestamp(completed_before, tz=UTC))

  for prop, desc in sorting:
    column = getattr(Task, prop.value)
    statement = statement.order_by(column.desc() if desc else column.asc())

  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  return TaskListResponse.from_paginated_results(
    [TaskSchema.model_validate(item) for item in items],
    total_count,
    pagination,
  )


@router.post(
  "",
  summary="Create Task",
  response_model=TaskSchema,
  status_code=201,
)
async def create_task(
  body: TaskCreate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> TaskSchema:
  repo = TaskRepository.from_session(session)
  task_data = body.model_dump()
  project = await _resolve_project(session, task_data.pop("project", None), current_user.id)
  task_data["project_id"] = project.id if project else None
  task_data["user_id"] = current_user.id
  if task_data.get("position") is None:
    max_pos = await repo.get_max_position()
    task_data["position"] = (max_pos or 0) + 1000
  task = Task(**task_data)
  task.project_obj = project
  await repo.create(task, flush=True)
  return TaskSchema.model_validate(task)


@router.patch(
  "/{task_id}",
  summary="Update Task",
  response_model=TaskSchema,
)
async def update_task(
  task_id: UUID,
  body: TaskUpdate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> TaskSchema:
  repo = TaskRepository.from_session(session)
  task = await _get_task_or_404(session, task_id, current_user.id)

  update_dict = body.model_dump(exclude_unset=True)
  if "project" in update_dict:
    project = await _resolve_project(session, update_dict.pop("project"), current_user.id)
    update_dict["project_id"] = project.id if project else None
    task.project_obj = project
  if update_dict:
    await repo.update(task, update_dict=update_dict)

  return TaskSchema.model_validate(task)


@router.delete(
  "/{task_id}",
  summary="Delete Task",
  status_code=204,
)
async def delete_task(
  task_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> None:
  task = await _get_task_or_404(session, task_id, current_user.id)
  await session.delete(task)


@router.post(
  "/{task_id}/complete",
  summary="Complete Task",
  response_model=TaskCompleteResponse,
)
async def complete_task(
  task_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> TaskCompleteResponse:
  repo = TaskRepository.from_session(session)
  task = await _get_task_or_404(session, task_id, current_user.id)

  # Mark as done
  await repo.update(task, update_dict={"status": "done", "completed_at": utc_now()})

  next_task_schema = None
  if task.is_recurring and task.rrule_frequency:
    next_due = compute_next_due_date(
      current_due=task.due_date,
      frequency=task.rrule_frequency,
      interval=task.rrule_interval or 1,
      day_of_week=task.rrule_day_of_week,
      day_of_month=task.rrule_day_of_month,
    )
    max_pos = await repo.get_max_position()
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
      user_id=current_user.id,
    )
    next_task.project_obj = task.project_obj
    await repo.create(next_task, flush=True)
    next_task_schema = TaskSchema.model_validate(next_task)

  return TaskCompleteResponse(
    completed_task=TaskSchema.model_validate(task),
    next_task=next_task_schema,
  )


@router.post(
  "/{task_id}/reopen",
  summary="Reopen Task",
  response_model=TaskSchema,
)
async def reopen_task(
  task_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> TaskSchema:
  repo = TaskRepository.from_session(session)
  task = await _get_task_or_404(session, task_id, current_user.id)
  await repo.update(task, update_dict={"status": "todo", "completed_at": None})
  return TaskSchema.model_validate(task)


@router.patch(
  "/reorder",
  summary="Reorder Tasks",
  status_code=204,
)
async def reorder_tasks(
  body: list[TaskReorderItem],
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> None:
  repo = TaskRepository.from_session(session)
  for item in body:
    task = await repo.get_by_id(item.id)
    if task is None or task.user_id != current_user.id:
      continue
    update: dict = {"position": item.position}
    if item.status is not None:
      update["status"] = item.status
    await repo.update(task, update_dict=update)


@router.get(
  "/areas",
  summary="List Areas",
  response_model=list[str],
)
async def list_areas(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> list[str]:
  result = await session.execute(
    select(Task.area).where(Task.area.is_not(None)).where(Task.user_id == current_user.id).group_by(Task.area).order_by(func.count().desc())
  )
  return [row[0] for row in result.all()]
