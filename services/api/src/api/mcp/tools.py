"""Read-only tools exposed over MCP.

Each tool resolves the caller from the bearer token via `user_session` and
reads through the same repositories and services as the REST endpoints.
"""

from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from mcp.server.mcpserver import Context
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field
from sqlalchemy import func

from api.activity.repository import ActivityRepository
from api.activity.service import ActivityService
from api.calendars.repository import CalendarEventRepository, CalendarPersonRepository
from api.calendars.service import calendar_service
from api.categories.repository import CategoryRepository
from api.healthkit.repository import HealthKitSleepSampleRepository, HealthKitWorkoutRepository
from api.healthkit.service import healthkit_sleep_service
from api.investments.repository import TradeRepository
from api.investments.service import investment_service
from api.mcp import schemas
from api.mcp.context import user_session
from api.models.category import Category
from api.models.recipe import Recipe
from api.models.task import Task
from api.models.transaction import Transaction, TransactionDirection
from api.recipes.repository import RecipeRepository
from api.recipes.schemas import RecipeSchema
from api.tasks.repository import TaskRepository
from api.tasks.schemas import TaskStatus
from api.transactions.repository import TransactionRepository
from api.transactions.service import transaction_service

MAX_CALENDAR_DAYS = 62
MAX_SLEEP_DAYS = 92
MAX_ACTIVITY_DAYS = 31

StartDate = Annotated[date, Field(description="First day of the range (inclusive), YYYY-MM-DD.")]
EndDate = Annotated[date, Field(description="Last day of the range (inclusive), YYYY-MM-DD.")]
Timezone = Annotated[str, Field(description="IANA timezone the dates are in, e.g. 'Europe/Stockholm'. Use the user's own timezone.")]


def _local_window(start_date: date, end_date: date, timezone: str, *, max_days: int) -> tuple[datetime, datetime]:
  """[start of `start_date`, start of the day after `end_date`) in `timezone`, as UTC datetimes."""
  try:
    tz = ZoneInfo(timezone)
  except (ZoneInfoNotFoundError, ValueError) as e:
    raise ToolError(f"Unknown timezone: {timezone}") from e
  if end_date < start_date:
    raise ToolError("end_date must not be before start_date.")
  if (end_date - start_date).days + 1 > max_days:
    raise ToolError(f"The range can span at most {max_days} days.")

  start = datetime.combine(start_date, time.min, tzinfo=tz)
  end = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=tz)
  return start.astimezone(UTC), end.astimezone(UTC)


async def get_calendar_events(ctx: Context, start_date: StartDate, end_date: EndDate, timezone: Timezone) -> schemas.CalendarEvents:
  """Events from all of the user's connected calendars that overlap the given days."""
  start, end = _local_window(start_date, end_date, timezone, max_days=MAX_CALENDAR_DAYS)
  async with user_session(ctx) as (session, user):
    rows = await CalendarEventRepository.from_session(session).list_in_range(user.id, start, end)
    events = await calendar_service.event_schemas(CalendarPersonRepository.from_session(session), user.id, rows)

  result: list[schemas.CalendarEvent] = []
  for event in events:
    if event.all_day:
      assert event.start_date is not None and event.end_date is not None
      # All-day rows come back padded by a day each side; keep only the requested days.
      if event.end_date <= start_date or event.start_date > end_date:
        continue
      event_start: datetime | date = event.start_date
      event_end: datetime | date = event.end_date
    else:
      assert event.start_at is not None and event.end_at is not None
      event_start, event_end = event.start_at, event.end_at
    result.append(
      schemas.CalendarEvent(
        id=event.id,
        title=event.title,
        all_day=event.all_day,
        start=event_start,
        end=event_end,
        location=event.location,
        description=event.description,
        attendees=[
          schemas.CalendarAttendee(name=a.name, email=a.email, response=a.response, is_organizer=a.is_organizer) for a in event.attendees if not a.is_self
        ],
        my_response=event.my_response,
        conference_url=event.conference_url,
        busy=event.busy,
        recurring=event.recurring,
      )
    )
  result.sort(key=lambda e: e.start if isinstance(e.start, datetime) else datetime.combine(e.start, time.min, tzinfo=ZoneInfo(timezone)))
  return schemas.CalendarEvents(events=result)


async def search_transactions(
  ctx: Context,
  date_from: Annotated[date | None, Field(description="Earliest transaction date (inclusive), YYYY-MM-DD.")] = None,
  date_to: Annotated[date | None, Field(description="Latest transaction date (inclusive), YYYY-MM-DD.")] = None,
  search: Annotated[str | None, Field(description="Case-insensitive text to look for in the description, e.g. a merchant name.")] = None,
  category: Annotated[str | None, Field(description="Exact category name (case-insensitive). See list_transaction_categories.")] = None,
  direction: Annotated[TransactionDirection | None, Field(description="debit for money out, credit for money in.")] = None,
  limit: Annotated[int, Field(ge=1, le=200, description="Maximum number of transactions to return.")] = 50,
) -> schemas.Transactions:
  """Bank transactions, newest first, optionally filtered by date, text, category and direction."""
  async with user_session(ctx) as (session, user):
    categories = await CategoryRepository.from_session(session).list_for_user(user.id, order_by=Category.name)
    category_ids: list[UUID] | None = None
    if category is not None:
      category_ids = [c.id for c in categories if c.name.casefold() == category.casefold()]
      if not category_ids:
        raise ToolError(f"No category named {category!r}. Call list_transaction_categories for the available names.")

    repo = TransactionRepository.from_session(session)
    statement = repo.get_filtered_statement(
      user.id, category_ids=category_ids, direction=direction, search=search, date_from=date_from, date_to=date_to
    ).order_by(Transaction.transaction_date.desc(), Transaction.id)
    rows, total_count = await repo.paginate(statement, limit=limit, page=1)

  category_names = {c.id: c.name for c in categories}
  return schemas.Transactions(
    total_count=total_count,
    transactions=[
      schemas.Transaction(
        id=t.id,
        date=t.transaction_date,
        amount=t.amount,
        currency=t.currency,
        direction=t.direction,
        description=t.description,
        category=category_names.get(t.category_id) if t.category_id else None,
        is_business=t.is_business,
      )
      for t in rows
    ],
  )


async def get_spending_by_category(
  ctx: Context,
  year: Annotated[int, Field(ge=2000, le=2100)],
  month: Annotated[int, Field(ge=1, le=12)],
) -> schemas.MonthlySpending:
  """Total spending (debits) per category for one calendar month."""
  async with user_session(ctx) as (session, user):
    rows = await TransactionRepository.from_session(session).spending_by_category(user_id=user.id, year=year, month=month)
  return schemas.MonthlySpending(
    year=year,
    month=month,
    categories=[schemas.CategorySpending(category=row.name, total=row.total) for row in rows],
  )


async def get_monthly_cash_flow(
  ctx: Context,
  months: Annotated[int, Field(ge=1, le=36, description="How many months to include, counting the current one.")] = 6,
) -> schemas.CashFlow:
  """Total income (credits) and expenses (debits) per month, up to and including the current month."""
  async with user_session(ctx) as (session, user):
    items = await transaction_service.monthly_flow(TransactionRepository.from_session(session), user.id, months=months, today=date.today())
  return schemas.CashFlow(months=items)


async def list_transaction_categories(ctx: Context) -> schemas.Categories:
  """The user's transaction categories."""
  async with user_session(ctx) as (session, user):
    categories = await CategoryRepository.from_session(session).list_for_user(user.id, order_by=Category.name)
  return schemas.Categories(categories=[schemas.Category(id=c.id, name=c.name, parent_id=c.parent_id, excluded=c.excluded) for c in categories])


async def search_recipes(
  ctx: Context,
  search: Annotated[str | None, Field(description="Case-insensitive text to look for in the title.")] = None,
  limit: Annotated[int, Field(ge=1, le=200)] = 50,
) -> schemas.Recipes:
  """The user's saved recipes. Use get_recipe for ingredients and steps."""
  async with user_session(ctx) as (session, user):
    repo = RecipeRepository.from_session(session)
    statement = repo.get_base_statement().where(Recipe.user_id == user.id)
    if search:
      statement = statement.where(Recipe.title.ilike(f"%{search}%"))
    rows, total_count = await repo.paginate(statement.order_by(func.lower(Recipe.title), Recipe.id), limit=limit, page=1)
  return schemas.Recipes(
    total_count=total_count,
    recipes=[schemas.RecipeSummary(id=r.id, title=r.title, recipe_type=r.recipe_type) for r in rows],
  )


async def get_recipe(ctx: Context, recipe_id: UUID) -> RecipeSchema:
  """One recipe with its ingredients and steps."""
  async with user_session(ctx) as (session, user):
    recipe = await RecipeRepository.from_session(session).get_owned_or_404(recipe_id, user.id, not_found_message="Recipe not found.")
    return RecipeSchema.model_validate(recipe)


async def search_tasks(
  ctx: Context,
  status: Annotated[list[TaskStatus] | None, Field(description="Only tasks in one of these statuses.")] = None,
  search: Annotated[str | None, Field(description="Case-insensitive text to look for in the title or description.")] = None,
  project: Annotated[str | None, Field(description="Exact project name.")] = None,
  area: Annotated[str | None, Field(description="Exact area, e.g. 'Personal'.")] = None,
  limit: Annotated[int, Field(ge=1, le=200)] = 50,
) -> schemas.Tasks:
  """The user's tasks, most recently changed first."""
  async with user_session(ctx) as (session, user):
    repo = TaskRepository.from_session(session)
    statement = repo.get_filtered_statement(user.id, statuses=status, search=search, project=project, area=area).order_by(
      func.coalesce(Task.modified_at, Task.created_at).desc(), Task.id
    )
    rows, total_count = await repo.paginate(statement, limit=limit, page=1)
    return schemas.Tasks(total_count=total_count, tasks=[_task(t) for t in rows])


async def get_task(ctx: Context, task_id: UUID) -> schemas.Task:
  """One task."""
  async with user_session(ctx) as (session, user):
    task = await TaskRepository.from_session(session).get_owned_or_404(task_id, user.id, not_found_message="Task not found.")
    return _task(task)


def _task(task: Task) -> schemas.Task:
  return schemas.Task(
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


async def get_sleep(ctx: Context, start_date: StartDate, end_date: EndDate, timezone: Timezone) -> schemas.Sleep:
  """Sleep from Apple Health: time asleep per night plus a sleep-stage breakdown for the range.

  A night belongs to the local date the user woke up on.
  """
  _local_window(start_date, end_date, timezone, max_days=MAX_SLEEP_DAYS)
  tz = ZoneInfo(timezone)
  # Nights run noon to noon (see healthkit_sleep_service), so the nights that
  # end on start_date..end_date span exactly these two local noons.
  start_ts = int(datetime.combine(start_date - timedelta(days=1), time(12), tzinfo=tz).timestamp())
  end_ts = int(datetime.combine(end_date, time(12), tzinfo=tz).timestamp())
  async with user_session(ctx) as (session, user):
    repo = HealthKitSleepSampleRepository.from_session(session)
    nights = await healthkit_sleep_service.nightly_totals(repo, user.id, start_ts, end_ts, tz, 0)
    summary = await healthkit_sleep_service.stage_summary(repo, user.id, start_ts, end_ts)
  return schemas.Sleep(nights=nights, total_asleep_secs=summary.total_asleep_secs, stages=summary.stages)


async def list_workouts(
  ctx: Context,
  limit: Annotated[int, Field(ge=1, le=100)] = 20,
) -> schemas.Workouts:
  """The user's most recent workouts from Apple Health, newest first."""
  async with user_session(ctx) as (session, user):
    repo = HealthKitWorkoutRepository.from_session(session)
    rows, _ = await repo.paginate(repo.get_list_statement(user.id), limit=limit, page=1)
  return schemas.Workouts(
    workouts=[
      schemas.Workout(
        id=w.id,
        type=w.workout_activity_type_name,
        start=w.start_date,
        end=w.end_date,
        duration_secs=w.duration,
        energy_burned_kcal=w.total_energy_burned,
        distance_m=w.total_distance,
        source=w.source_name,
      )
      for w in rows
    ]
  )


async def get_computer_activity(
  ctx: Context,
  start_date: StartDate,
  end_date: EndDate,
  timezone: Timezone,
  source: Annotated[str | None, Field(description="Which computer to report on. Defaults to the most recently active one.")] = None,
) -> schemas.ComputerActivity:
  """Active time at the computer per application, from the desktop activity tracker."""
  start, end = _local_window(start_date, end_date, timezone, max_days=MAX_ACTIVITY_DAYS)
  async with user_session(ctx) as (session, user):
    repo = ActivityRepository.from_session(session)
    if source is None:
      sources = await repo.get_sources(user.id)
      if not sources:
        raise ToolError("No computer activity has been recorded.")
      source = sources[0]
    summary = await ActivityService().summarize(repo, user.id, source, int(start.timestamp()), int(end.timestamp()))
  return schemas.ComputerActivity.model_validate(summary.model_dump())


async def get_investment_holdings(ctx: Context) -> schemas.Holdings:
  """Current investment positions, valued at each security's latest recorded price.

  Quantities are in micro-units (x1,000,000); money is in minor units (cents) of the security's currency.
  """
  async with user_session(ctx) as (session, user):
    holdings = await investment_service.holdings(TradeRepository.from_session(session), user.id)
  return schemas.Holdings(holdings=holdings)


TOOLS = [
  (get_calendar_events, "Calendar events"),
  (search_transactions, "Search transactions"),
  (get_spending_by_category, "Spending by category"),
  (get_monthly_cash_flow, "Monthly cash flow"),
  (list_transaction_categories, "Transaction categories"),
  (search_recipes, "Search recipes"),
  (get_recipe, "Get recipe"),
  (search_tasks, "Search tasks"),
  (get_task, "Get task"),
  (get_sleep, "Sleep"),
  (list_workouts, "Workouts"),
  (get_computer_activity, "Computer activity"),
  (get_investment_holdings, "Investment holdings"),
]
