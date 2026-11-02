from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query
from pydantic import ValidationError as PydanticValidationError

from api.common.utils import utc_now
from api.exceptions import ValidationError
from api.goals.repository import GoalCheckinRepository, GoalPlanRepository, GoalRepository
from api.goals.schemas import GoalCheckinCreate, GoalCreate, GoalPlanSchema, GoalSchema, GoalScoreboard, GoalUpdate, TypicalDay
from api.goals.service import goal_service
from api.goals.typical import typical_day
from api.models.goal import Goal, GoalCheckin, GoalMetric, GoalPlan
from api.models.user import User
from api.patterns.service import PatternsService
from api.postgres import DBSession
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/goals", tags=["goals"])

MAX_GOALS = 50


def _zone(user: User) -> ZoneInfo:
  return ZoneInfo(user.timezone or "UTC")


@router.get("", summary="List Goals", response_model=list[GoalSchema])
async def list_goals(session: DBSession, current_user: CurrentDBUser) -> list[GoalSchema]:
  return [GoalSchema.model_validate(g) for g in await GoalRepository.from_session(session).list_for_user(current_user.id)]


@router.get("/scoreboard", summary="Goal Scoreboard", response_model=GoalScoreboard)
async def goal_scoreboard(
  session: DBSession,
  current_user: CurrentDBUser,
  include_private: bool = Query(default=True, description="Include goals marked private."),
) -> GoalScoreboard:
  """Each goal measured for this week or month so far and the periods before it, from the user's own data."""
  return await goal_service.scoreboard(session, current_user.id, _zone(current_user), include_private=include_private)


@router.post("", summary="Create Goal", response_model=GoalSchema, status_code=201)
async def create_goal(body: GoalCreate, session: DBSession, current_user: CurrentDBUser) -> GoalSchema:
  repo = GoalRepository.from_session(session)
  existing = await repo.list_for_user(current_user.id)
  if len(existing) >= MAX_GOALS:
    raise ValidationError(f"At most {MAX_GOALS} goals; remove one first.")
  goal = Goal(
    **body.model_dump(exclude={"params"}),
    params=body.params.model_dump(exclude_none=True, exclude_defaults=True),
    position=max((g.position for g in existing), default=-1) + 1,
    user_id=current_user.id,
  )
  await repo.create(goal, flush=True)
  return GoalSchema.model_validate(goal)


@router.patch("/{goal_id}", summary="Update Goal", response_model=GoalSchema)
async def update_goal(goal_id: UUID, body: GoalUpdate, session: DBSession, current_user: CurrentDBUser) -> GoalSchema:
  repo = GoalRepository.from_session(session)
  goal = await repo.get_owned_or_404(goal_id, current_user.id, not_found_message="Goal not found")
  changes = body.model_dump(exclude_unset=True)
  if "params" in changes:
    changes["params"] = body.params.model_dump(exclude_none=True, exclude_defaults=True) if body.params else {}
  # The metric and period stay: changing them would make the history mean something else. Make a new goal instead.
  try:
    candidate = GoalCreate.model_validate({**GoalSchema.model_validate(goal).model_dump(), **changes})
  except PydanticValidationError as error:
    raise ValidationError(error.errors()[0]["msg"], status_code=422) from error
  await repo.update(goal, update_dict={**changes, "params": candidate.params.model_dump(exclude_none=True, exclude_defaults=True)}, flush=True)
  return GoalSchema.model_validate(goal)


@router.delete("/{goal_id}", summary="Delete Goal", status_code=204)
async def delete_goal(goal_id: UUID, session: DBSession, current_user: CurrentDBUser) -> None:
  repo = GoalRepository.from_session(session)
  goal = await repo.get_owned_or_404(goal_id, current_user.id, not_found_message="Goal not found")
  goal.set_deleted_at()
  await session.flush()


@router.post("/{goal_id}/checkins", summary="Check In Goal", status_code=204)
async def check_in_goal(goal_id: UUID, body: GoalCheckinCreate, session: DBSession, current_user: CurrentDBUser) -> None:
  goal = await GoalRepository.from_session(session).get_owned_or_404(goal_id, current_user.id, not_found_message="Goal not found")
  if goal.metric != GoalMetric.manual:
    raise ValidationError("Only manual goals take check-ins; the rest are measured from your data.")
  await GoalCheckinRepository.from_session(session).create(GoalCheckin(user_id=current_user.id, goal_id=goal.id, day=body.day, value=body.value), flush=True)


@router.get("/plan", summary="Get Goal Plan", response_model=GoalPlanSchema)
async def get_goal_plan(session: DBSession, current_user: CurrentDBUser) -> GoalPlanSchema:
  plan = await GoalPlanRepository.from_session(session).get_for_user(current_user.id)
  return GoalPlanSchema.model_validate(plan) if plan else GoalPlanSchema()


@router.put("/plan", summary="Save Goal Plan", response_model=GoalPlanSchema)
async def save_goal_plan(body: GoalPlanSchema, session: DBSession, current_user: CurrentDBUser) -> GoalPlanSchema:
  """The user's own words; empty fields clear."""
  repo = GoalPlanRepository.from_session(session)
  plan = await repo.get_for_user(current_user.id)
  fields = {key: (value.strip() or None) if isinstance(value, str) else None for key, value in body.model_dump().items()}
  if plan is None:
    plan = await repo.create(GoalPlan(user_id=current_user.id, **fields), flush=True)
  else:
    await repo.update(plan, update_dict=fields, flush=True)
  return GoalPlanSchema.model_validate(plan)


@router.get("/typical-day", summary="Typical Day", response_model=TypicalDay)
async def get_typical_day(
  session: DBSession,
  current_user: CurrentDBUser,
  weekday: int = Query(ge=0, le=6, description="0 is Monday."),
  weeks: int = Query(default=6, ge=2, le=26),
) -> TypicalDay:
  """What that weekday has looked like over the last weeks, from the user's data: when they woke and slept, their
  time at the computer, tasks done, gym and steps."""
  zone = _zone(current_user)
  today = utc_now().astimezone(zone).date()
  data = await PatternsService().load(session, current_user.id, zone, today, weeks * 7 + 1)
  return typical_day(data, weekday, weeks)
