"""Tool outputs. Kept compact: everything here is read by a language model, so
internal bookkeeping (dedup hashes, UI positions, colours) is left out."""

from datetime import date, datetime
from uuid import UUID

from api.activity.schemas import ActivitySummaryResponse
from api.calendars.providers import AttendeeResponse
from api.common.schemas import Schema
from api.healthkit.schemas import SleepDailyEntry, SleepStageSummary
from api.investments.schemas import HoldingSchema
from api.models.recipe import RecipeType
from api.models.transaction import TransactionDirection
from api.tasks.schemas import TaskStatus
from api.transactions.schemas import MonthlyFlow
from pydantic import Field


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


class Transaction(Schema):
  id: UUID
  date: date
  amount: int = Field(description="Minor units (cents), always positive; see `direction`.")
  currency: str
  direction: TransactionDirection = Field(description="debit is money out, credit is money in.")
  description: str | None
  category: str | None = Field(description="Category name, or null if uncategorized.")
  is_business: bool


class Transactions(Schema):
  total_count: int = Field(description="Matching transactions, including any beyond `limit`.")
  transactions: list[Transaction] = Field(description="Newest first.")


class CategorySpending(Schema):
  category: str
  total: int = Field(description="Debits in minor units (cents).")


class MonthlySpending(Schema):
  year: int
  month: int
  categories: list[CategorySpending] = Field(description="Largest first. Uncategorized spending is not included.")


class CashFlow(Schema):
  months: list[MonthlyFlow] = Field(description="Oldest first. Amounts in minor units (cents).")


class Category(Schema):
  id: UUID
  name: str
  parent_id: UUID | None
  excluded: bool = Field(description="Excluded from spending reports.")


class Categories(Schema):
  categories: list[Category]


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


class Holdings(Schema):
  holdings: list[HoldingSchema]
