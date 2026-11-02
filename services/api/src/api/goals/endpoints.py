from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query
from pydantic import ValidationError as PydanticValidationError

from api.exceptions import ValidationError
from api.goals.repository import GoalCheckinRepository, GoalRepository
from api.goals.schemas import GoalCheckinCreate, GoalCreate, GoalSchema, GoalScoreboard, GoalUpdate
from api.goals.service import goal_service
from api.models.goal import Goal, GoalCheckin, GoalMetric
from api.models.user import User
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
