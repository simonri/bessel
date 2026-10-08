"""Tool outputs. Kept compact: everything here is read by a language model, so
internal bookkeeping (dedup hashes, UI positions, colours) is left out."""

from datetime import date, datetime
from uuid import UUID

from pydantic import Field

from api.activity.schemas import ActivitySummaryResponse
from api.calendars.providers import AttendeeResponse
from api.common.schemas import Schema
from api.healthkit.schemas import SleepDailyEntry, SleepStageSummary
from api.models.recipe import RecipeType
from api.tasks.schemas import TaskStatus


class CalendarAttendee(Schema):
  name: str | None
  email: str
  response: AttendeeResponse
  is_organizer: bool


class CalendarEvent(Schema):
  id: UUID
  title: str
  all_day: bool
  start: datetime | date = Field(description="Start time, or start date for all-day events.")
  end: datetime | date = Field(description="End time, or the exclusive end date for all-day events.")
  location: str | None
  description: str | None
  attendees: list[CalendarAttendee]
  my_response: AttendeeResponse | None = Field(description="The user's own reply when invited; null when they aren't a guest.")
  conference_url: str | None
  busy: bool
  recurring: bool


class CalendarEvents(Schema):
  events: list[CalendarEvent] = Field(description="Sorted by start.")


class RecipeSummary(Schema):
  id: UUID
  title: str
  recipe_type: RecipeType


class Recipes(Schema):
  total_count: int
  recipes: list[RecipeSummary] = Field(description="Alphabetical by title.")


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


class Sleep(Schema):
  nights: list[SleepDailyEntry] = Field(description="One entry per night, keyed by the local date the user woke up.")
  total_asleep_secs: int
  stages: list[SleepStageSummary] = Field(description="Time per sleep stage across the whole range, largest first.")


class Workout(Schema):
  id: UUID
  type: str
  start: datetime
  end: datetime
  duration_secs: float
  energy_burned_kcal: float | None
  distance_m: float | None
  source: str


class Workouts(Schema):
  workouts: list[Workout] = Field(description="Newest first.")


class ComputerActivity(ActivitySummaryResponse):
  pass
