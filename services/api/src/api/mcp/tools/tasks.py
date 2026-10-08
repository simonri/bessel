from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from mcp.server.mcpserver import Context
from pydantic import Field
from sqlalchemy import func

from api.common.schemas import Schema
from api.mcp.context import user_session
from api.mcp.tools.common import ToolSpec, read
from api.models.task import Task as TaskModel
from api.tasks.repository import TaskRepository
from api.tasks.schemas import TaskStatus


class Task(Schema):
  id: UUID
  title: str
  description: str | None
  status: TaskStatus
  priority: int = Field(description="0 none, 1 low, 2 medium, 3 high, 4 urgent.")
  due_date: date | None
  completed_at: datetime | None
  project: str | None
  area: str | None
  tags: list[str] | None
  is_recurring: bool


class Tasks(Schema):
  total_count: int
  tasks: list[Task] = Field(description="Most recently changed first.")


def to_task(task: TaskModel) -> Task:
  return Task(
    id=task.id,
    title=task.title,
    description=task.description,
    status=TaskStatus(task.status),
    priority=task.priority,
    due_date=task.due_date,
    completed_at=task.completed_at,
    project=task.project_obj.name if task.project_obj else None,
    area=task.area,
    tags=task.tags,
    is_recurring=task.is_recurring,
  )


async def search_tasks(
  ctx: Context,
  status: Annotated[list[TaskStatus] | None, Field(description="Only tasks in one of these statuses.")] = None,
  search: Annotated[str | None, Field(description="Case-insensitive text to look for in the title or description.")] = None,
  project: Annotated[str | None, Field(description="Exact project name.")] = None,
  area: Annotated[str | None, Field(description="Exact area, e.g. 'Personal'.")] = None,
  limit: Annotated[int, Field(ge=1, le=200)] = 50,
) -> Tasks:
  """The user's tasks, most recently changed first."""
  async with user_session(ctx) as (session, user):
    repo = TaskRepository.from_session(session)
    statement = repo.get_filtered_statement(user.id, statuses=status, search=search, project=project, area=area).order_by(
      func.coalesce(TaskModel.modified_at, TaskModel.created_at).desc(), TaskModel.id
    )
    rows, total_count = await repo.paginate(statement, limit=limit, page=1)
    return Tasks(total_count=total_count, tasks=[to_task(t) for t in rows])


async def get_task(ctx: Context, task_id: UUID) -> Task:
  """One task."""
  async with user_session(ctx) as (session, user):
    task = await TaskRepository.from_session(session).get_owned_or_404(task_id, user.id, not_found_message="Task not found.")
    return to_task(task)


TOOLS: list[ToolSpec] = [
  read(search_tasks, "Search tasks"),
  read(get_task, "Get task"),
]
