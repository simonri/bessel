from datetime import datetime, timezone
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select

from api.common.pagination import PaginationParamsQuery
from api.common.sorting import Sorting, SortingGetter
from api.common.utils import utc_now
from api.exceptions import ResourceNotFound
from api.models.task import Task
from api.postgres import AsyncSession, get_db_session
from api.tasks.recurrence import compute_next_due_date
from api.tasks.repository import TaskRepository
from api.tasks.schemas import TaskCompleteResponse, TaskCreate, TaskListResponse, TaskReorderItem, TaskSchema, TaskStatus, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])


class TaskSortProperty(StrEnum):
  created_at = "created_at"
  due_date = "due_date"
  priority = "priority"
  title = "title"
  completed_at = "completed_at"
  position = "position"


sorting_getter = SortingGetter(TaskSortProperty, default_sorting=["-created_at"])


@router.get(
  "",
  summary="List Tasks",
  response_model=TaskListResponse,
)
async def list_tasks(
  session: Annotated[AsyncSession, Depends(get_db_session)],
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
  statement = repo.get_base_statement()

  if status is not None:
    statement = statement.where(Task.status == status)
  if priority is not None:
    statement = statement.where(Task.priority == priority)
  if project is not None:
    statement = statement.where(Task.project == project)
  if area is not None:
    statement = statement.where(Task.area == area)
  if is_recurring is not None:
    statement = statement.where(Task.is_recurring == is_recurring)
  if completed_after is not None:
    statement = statement.where(Task.completed_at >= datetime.fromtimestamp(completed_after, tz=timezone.utc))
  if completed_before is not None:
    statement = statement.where(Task.completed_at < datetime.fromtimestamp(completed_before, tz=timezone.utc))

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
) -> TaskSchema:
  repo = TaskRepository.from_session(session)
  task = Task(**body.model_dump())
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
) -> TaskSchema:
  repo = TaskRepository.from_session(session)
  task = await repo.get_by_id(task_id)
  if task is None:
    raise ResourceNotFound("Task not found")

  update_dict = body.model_dump(exclude_unset=True)
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
) -> None:
  repo = TaskRepository.from_session(session)
  task = await repo.get_by_id(task_id)
  if task is None:
    raise ResourceNotFound("Task not found")
  await session.delete(task)


@router.post(
  "/{task_id}/complete",
  summary="Complete Task",
  response_model=TaskCompleteResponse,
)
async def complete_task(
  task_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TaskCompleteResponse:
  repo = TaskRepository.from_session(session)
  task = await repo.get_by_id(task_id)
  if task is None:
    raise ResourceNotFound("Task not found")

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
    next_task = Task(
      title=task.title,
      description=task.description,
      status="todo",
      priority=task.priority,
      due_date=next_due,
      project=task.project,
      area=task.area,
      tags=task.tags,
      position=task.position,
      is_recurring=True,
      rrule_frequency=task.rrule_frequency,
      rrule_interval=task.rrule_interval,
      rrule_day_of_week=task.rrule_day_of_week,
      rrule_day_of_month=task.rrule_day_of_month,
      parent_task_id=task.id,
    )
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
) -> TaskSchema:
  repo = TaskRepository.from_session(session)
  task = await repo.get_by_id(task_id)
  if task is None:
    raise ResourceNotFound("Task not found")

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
) -> None:
  repo = TaskRepository.from_session(session)
  for item in body:
    task = await repo.get_by_id(item.id)
    if task is None:
      continue
    update: dict = {"position": item.position}
    if item.status is not None:
      update["status"] = item.status
    await repo.update(task, update_dict=update)


@router.get(
  "/projects",
  summary="List Projects",
  response_model=list[str],
)
async def list_projects(
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[str]:
  result = await session.execute(select(Task.project).where(Task.project.is_not(None)).group_by(Task.project).order_by(func.count().desc()))
  return [row[0] for row in result.all()]


@router.get(
  "/areas",
  summary="List Areas",
  response_model=list[str],
)
async def list_areas(
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[str]:
  result = await session.execute(select(Task.area).where(Task.area.is_not(None)).group_by(Task.area).order_by(func.count().desc()))
  return [row[0] for row in result.all()]
