import datetime
from uuid import UUID

from pydantic import Field

from api.common.schemas import Schema
from api.tasks.schemas import TaskStatus


class TaskHit(Schema):
  id: UUID
  title: str
  status: TaskStatus


class RecipeHit(Schema):
  id: UUID
  title: str


class EventHit(Schema):
  id: UUID
  title: str
  all_day: bool
  start_at: datetime.datetime | None = Field(description="Start of a timed event.")
  start_date: datetime.date | None = Field(description="First day of an all-day event.")


class PlaceHit(Schema):
  id: UUID
  name: str
  address: str | None


class SearchResponse(Schema):
  tasks: list[TaskHit]
  recipes: list[RecipeHit]
  events: list[EventHit]
  places: list[PlaceHit]
