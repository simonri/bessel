"""Goals: what the user is working toward, measured from their own data."""

from typing import Annotated
from uuid import UUID

from mcp.server.mcpserver import Context
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field

from api.common.schemas import Schema
from api.exceptions import ResourceNotFound
from api.goals.repository import GoalCheckinRepository, GoalRepository
from api.goals.schemas import GoalCreate, GoalSchema, GoalScoreboard
from api.goals.service import goal_service
from api.mcp.context import user_session
from api.mcp.dates import Day, TimezoneParam, parse_day, resolve_timezone, today_in
from api.mcp.tools.common import ToolSpec, read, write
from api.models.goal import Goal, GoalCheckin, GoalMetric

MAX_GOALS = 50
MAX_BATCH = 20


async def _owned(repo: GoalRepository, goal_id: UUID, user_id: UUID) -> Goal:
  try:
    return await repo.get_owned_or_404(goal_id, user_id)
  except ResourceNotFound as error:
    raise ToolError(f"No goal with id {goal_id}.") from error


async def get_goal_scoreboard(
  ctx: Context,
  include_private: Annotated[bool, Field(description="Also the goals the user marked private. Only when the conversation is about them.")] = False,
  timezone: TimezoneParam = None,
) -> GoalScoreboard:
  """The user's goals measured against their own data: this week (or month) so far, the 8 weeks (6 months) before,
  the streak of periods met, and, while a target is still far off, `step`: the next rung, one better than their best
  recent period. Start a weekly review or a talk about progress with it: say plainly what moved and what didn't.

  `measured` false means there is no data for that metric yet (say what would supply it, e.g. syncing sleep).
  """
  async with user_session(ctx) as (session, user):
    return await goal_service.scoreboard(session, user.id, resolve_timezone(user, timezone), include_private=include_private)


class GoalsAdded(Schema):
  goals: list[GoalSchema]


async def add_goals(ctx: Context, goals: Annotated[list[GoalCreate], Field(min_length=1, max_length=MAX_BATCH)]) -> GoalsAdded:
  """Adds goals the user decided on, each a metric, a target and a period, e.g. "asleep by 00:30 five nights a week"
  is metric sleep_before, params {"time": "00:30"}, target 5, period week.

  Metrics: sleep_before / wake_before (params.time), gym_sessions, tasks_completed (params.project optional),
  people_met (days with a "met" interaction logged; params.exclude_tags e.g. ["family"]), net_worth (params.currency,
  params.owner personal/company/all; period none: a level to reach by `deadline`), and manual for anything else
  (the user checks in with check_in_goals). comparison at_most for a limit ("at most 3 days a week").
  Mark a goal private when the user wouldn't want it shown outside talks about it. Only add goals the user chose.
  """
  async with user_session(ctx) as (session, user):
    repo = GoalRepository.from_session(session)
    existing = await repo.list_for_user(user.id)
    if len(existing) + len(goals) > MAX_GOALS:
      raise ToolError(f"At most {MAX_GOALS} goals; the user has {len(existing)}.")
    position = max((g.position for g in existing), default=-1)
    added = []
    for index, item in enumerate(goals, start=1):
      goal = Goal(
        **item.model_dump(exclude={"params"}),
        params=item.params.model_dump(exclude_none=True, exclude_defaults=True),
        position=position + index,
        user_id=user.id,
      )
      await repo.create(goal, flush=True)
      added.append(GoalSchema.model_validate(goal))
    return GoalsAdded(goals=added)


class GoalChange(Schema):
  goal_id: UUID
  title: str | None = Field(default=None, min_length=1, max_length=200)
  target: float | None = Field(default=None, ge=0, le=1e12)
  why: str | None = Field(default=None, max_length=2000)


async def update_goals(ctx: Context, changes: Annotated[list[GoalChange], Field(min_length=1, max_length=MAX_BATCH)]) -> GoalsAdded:
  """Changes a goal's title, target or the reason behind it, when the user decided to. The metric and period stay:
  for a different measure, add a new goal. Goals can't be deleted here; the user does that in Bessel."""
  async with user_session(ctx) as (session, user):
    repo = GoalRepository.from_session(session)
    updated = []
    for change in changes:
      goal = await _owned(repo, change.goal_id, user.id)
      await repo.update(goal, update_dict=change.model_dump(exclude={"goal_id"}, exclude_none=True), flush=True)
      updated.append(GoalSchema.model_validate(goal))
    return GoalsAdded(goals=updated)


class CheckIn(Schema):
  goal_id: UUID
  day: Day = "today"
  value: float = Field(default=1, ge=0, le=1e9, description="How much, e.g. 1 for 'did it once', or pages read.")


class CheckedIn(Schema):
  checked_in: int


async def check_in_goals(
  ctx: Context, check_ins: Annotated[list[CheckIn], Field(min_length=1, max_length=MAX_BATCH)], timezone: TimezoneParam = None
) -> CheckedIn:
  """Records what the user reports for their manual goals, e.g. "read 30 pages today". Only manual goals: the rest are
  measured from their data. Only what the user said they did."""
  async with user_session(ctx) as (session, user):
    today = today_in(resolve_timezone(user, timezone))
    goals = GoalRepository.from_session(session)
    checkins = GoalCheckinRepository.from_session(session)
    for item in check_ins:
      goal = await _owned(goals, item.goal_id, user.id)
      if goal.metric != GoalMetric.manual:
        raise ToolError(f"{goal.title!r} is measured from the user's data; only manual goals take check-ins.")
      await checkins.create(GoalCheckin(user_id=user.id, goal_id=goal.id, day=parse_day(item.day, today), value=item.value), flush=True)
    return CheckedIn(checked_in=len(check_ins))


TOOLS: list[ToolSpec] = [
  read(get_goal_scoreboard, "Goal scoreboard"),
  write(add_goals, "Add goals"),
  write(update_goals, "Update goals", overwrites=True),
  write(check_in_goals, "Check in goals"),
]
