from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from pydantic import Field

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema


class TaskStatus(StrEnum):
  todo = "todo"
  in_progress = "in_progress"
  done = "done"
  cancelled = "cancelled"


class TaskPriority(int):
  """0=none, 1=low, 2=medium, 3=high, 4=urgent"""


class RruleFrequency(StrEnum):
  daily = "daily"
  weekly = "weekly"
  monthly = "monthly"
  yearly = "yearly"


class TaskSchema(IDSchema, TimestampedSchema):
  title: str = Field(description="Task title.")
  description: str | None = Field(default=None, description="Task description.")
  status: TaskStatus = Field(default=TaskStatus.todo, description="Task status.")
  priority: int = Field(default=0, description="Priority (0=none, 1=low, 2=medium, 3=high, 4=urgent).")

  due_date: date | None = Field(default=None, description="Due date.")
  completed_at: datetime | None = Field(default=None, description="Completion timestamp.")

  project: str | None = Field(default=None, description="Project name.")
  area: str | None = Field(default=None, description="Area (e.g. Company, Personal, Travel).")
  tags: list[str] | None = Field(default=None, description="User-defined tags.")
  position: float = Field(default=0, description="Position for ordering within a status column.")

  is_recurring: bool = Field(default=False, description="Whether this task recurs.")
  rrule_frequency: RruleFrequency | None = Field(default=None, description="Recurrence frequency.")
  rrule_interval: int | None = Field(default=None, description="Recurrence interval.")
  rrule_day_of_week: int | None = Field(default=None, description="Day of week for weekly recurrence (0=Mon, 6=Sun).")
  rrule_day_of_month: int | None = Field(default=None, description="Day of month for monthly recurrence (1-31).")

  parent_task_id: UUID | None = Field(default=None, description="Parent task ID for recurring chain.")


class TaskCreate(Schema):
  title: str = Field(max_length=500, description="Task title.")
  description: str | None = Field(default=None)
  status: TaskStatus = Field(default=TaskStatus.todo)
  priority: int = Field(default=0, ge=0, le=4)

  due_date: date | None = Field(default=None)

  project: str | None = Field(default=None, max_length=100)
  area: str | None = Field(default=None, max_length=100)
  tags: list[str] | None = Field(default=None)
  position: float = Field(default=0)

  is_recurring: bool = Field(default=False)
  rrule_frequency: RruleFrequency | None = Field(default=None)
  rrule_interval: int | None = Field(default=None, ge=1)
  rrule_day_of_week: int | None = Field(default=None, ge=0, le=6)
  rrule_day_of_month: int | None = Field(default=None, ge=1, le=31)


class TaskUpdate(Schema):
  title: str | None = Field(default=None, max_length=500)
  description: str | None = Field(default=None)
  status: TaskStatus | None = Field(default=None)
  priority: int | None = Field(default=None, ge=0, le=4)

  due_date: date | None = Field(default=None)

  project: str | None = Field(default=None, max_length=100)
  area: str | None = Field(default=None, max_length=100)
  tags: list[str] | None = Field(default=None)
  position: float | None = Field(default=None)

  is_recurring: bool | None = Field(default=None)
  rrule_frequency: RruleFrequency | None = Field(default=None)
  rrule_interval: int | None = Field(default=None, ge=1)
  rrule_day_of_week: int | None = Field(default=None, ge=0, le=6)
  rrule_day_of_month: int | None = Field(default=None, ge=1, le=31)


class TaskReorderItem(Schema):
  id: UUID
  position: float
  status: TaskStatus | None = Field(default=None)


class TaskListResponse(ListResource[TaskSchema]):
  pass


class TaskCompleteResponse(Schema):
  completed_task: TaskSchema
  next_task: TaskSchema | None = Field(default=None, description="Next recurring instance, if applicable.")
