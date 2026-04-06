from enum import StrEnum
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from api.common.pagination import PaginationParamsQuery
from api.common.sorting import Sorting, SortingGetter
from api.exceptions import ResourceNotFound
from api.models.exercise import Exercise, MuscleCategory
from api.models.workout_log import WorkoutLog
from api.models.workout_set import WorkoutSet
from api.postgres import AsyncSession, get_db_session
from api.workouts.repository import ExerciseRepository, WorkoutLogRepository, WorkoutSetRepository
from api.workouts.schemas import (
  ExerciseCreate,
  ExerciseListResponse,
  ExercisePRListResponse,
  ExercisePRSchema,
  ExerciseSchema,
  LastSessionBestSet,
  LastSessionResponse,
  LastSessionSetSchema,
  WorkoutLogCreate,
  WorkoutLogDetailSchema,
  WorkoutLogListResponse,
  WorkoutLogSchema,
  WorkoutLogUpdate,
  WorkoutSetCreate,
  WorkoutSetSchema,
  WorkoutSetUpdate,
)
from api.workouts.service import workout_service

router = APIRouter(prefix="/workouts", tags=["workouts"])


# --- Exercises ---


@router.get(
  "/exercises",
  summary="List Exercises",
  response_model=ExerciseListResponse,
)
async def list_exercises(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  pagination: PaginationParamsQuery,
  q: str | None = Query(default=None, description="Search exercises by name."),
  category: MuscleCategory | None = Query(default=None, description="Filter by muscle category."),  # noqa: B008
) -> ExerciseListResponse:
  repo = ExerciseRepository.from_session(session)
  statement = repo.get_base_statement()

  if q:
    statement = statement.where(Exercise.name.ilike(f"%{q}%"))
  if category:
    statement = statement.where(Exercise.category == category)

  statement = statement.order_by(Exercise.name.asc())

  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  return ExerciseListResponse.from_paginated_results(
    [ExerciseSchema.model_validate(item) for item in items],
    total_count,
    pagination,
  )


@router.get(
  "/exercises/recent",
  summary="Recent Exercises",
  response_model=list[ExerciseSchema],
)
async def list_recent_exercises(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  limit: int = Query(default=10, ge=1, le=50),
) -> list[ExerciseSchema]:
  set_repo = WorkoutSetRepository.from_session(session)
  exercise_repo = ExerciseRepository.from_session(session)

  recent_ids = await set_repo.get_recent_exercises(limit=limit)
  if not recent_ids:
    return []

  exercises = []
  for eid in recent_ids:
    exercise = await exercise_repo.get_by_id(eid)
    if exercise:
      exercises.append(ExerciseSchema.model_validate(exercise))
  return exercises


@router.post(
  "/exercises",
  summary="Create Custom Exercise",
  response_model=ExerciseSchema,
  status_code=201,
)
async def create_exercise(
  body: ExerciseCreate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ExerciseSchema:
  repo = ExerciseRepository.from_session(session)
  exercise = Exercise(**body.model_dump(), is_custom=True)
  await repo.create(exercise, flush=True)
  return ExerciseSchema.model_validate(exercise)


# --- Workout Logs ---


class WorkoutLogSortProperty(StrEnum):
  created_at = "created_at"
  started_at = "started_at"


sorting_getter = SortingGetter(WorkoutLogSortProperty, default_sorting=["-started_at"])


@router.get(
  "",
  summary="List Workouts",
  response_model=WorkoutLogListResponse,
)
async def list_workouts(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  pagination: PaginationParamsQuery,
  sorting: Annotated[list[Sorting[WorkoutLogSortProperty]], Depends(sorting_getter)],
) -> WorkoutLogListResponse:
  repo = WorkoutLogRepository.from_session(session)
  statement = repo.get_base_statement()

  for prop, desc in sorting:
    column = getattr(WorkoutLog, prop.value)
    statement = statement.order_by(column.desc() if desc else column.asc())

  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  return WorkoutLogListResponse.from_paginated_results(
    [WorkoutLogSchema.model_validate(item) for item in items],
    total_count,
    pagination,
  )


@router.get(
  "/{workout_id}",
  summary="Get Workout Detail",
  response_model=WorkoutLogDetailSchema,
)
async def get_workout(
  workout_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> WorkoutLogDetailSchema:
  log_repo = WorkoutLogRepository.from_session(session)
  set_repo = WorkoutSetRepository.from_session(session)

  workout = await log_repo.get_by_id(workout_id)
  if workout is None:
    raise ResourceNotFound("Workout not found")

  sets = await set_repo.get_all(set_repo.get_sets_for_workout(workout_id))

  return WorkoutLogDetailSchema(
    **WorkoutLogSchema.model_validate(workout).model_dump(),
    sets=[WorkoutSetSchema.model_validate(s) for s in sets],
  )


@router.post(
  "",
  summary="Create Workout",
  response_model=WorkoutLogSchema,
  status_code=201,
)
async def create_workout(
  body: WorkoutLogCreate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> WorkoutLogSchema:
  repo = WorkoutLogRepository.from_session(session)
  workout = WorkoutLog(**body.model_dump())
  await repo.create(workout, flush=True)
  return WorkoutLogSchema.model_validate(workout)


@router.patch(
  "/{workout_id}",
  summary="Update Workout",
  response_model=WorkoutLogSchema,
)
async def update_workout(
  workout_id: UUID,
  body: WorkoutLogUpdate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> WorkoutLogSchema:
  repo = WorkoutLogRepository.from_session(session)
  workout = await repo.get_by_id(workout_id)
  if workout is None:
    raise ResourceNotFound("Workout not found")

  update_dict = body.model_dump(exclude_unset=True)
  if update_dict:
    await repo.update(workout, update_dict=update_dict)

  return WorkoutLogSchema.model_validate(workout)


@router.delete(
  "/{workout_id}",
  summary="Delete Workout",
  status_code=204,
)
async def delete_workout(
  workout_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
  repo = WorkoutLogRepository.from_session(session)
  workout = await repo.get_by_id(workout_id)
  if workout is None:
    raise ResourceNotFound("Workout not found")
  await session.delete(workout)


# --- Workout Sets ---


@router.post(
  "/{workout_id}/sets",
  summary="Add Set to Workout",
  response_model=WorkoutSetSchema,
  status_code=201,
)
async def create_workout_set(
  workout_id: UUID,
  body: WorkoutSetCreate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> WorkoutSetSchema:
  log_repo = WorkoutLogRepository.from_session(session)
  set_repo = WorkoutSetRepository.from_session(session)

  workout = await log_repo.get_by_id(workout_id)
  if workout is None:
    raise ResourceNotFound("Workout not found")

  workout_set = WorkoutSet(workout_log_id=workout_id, **body.model_dump())

  workout_service.compute_e1rm(workout_set)
  await workout_service.check_and_flag_pr(session, workout_set)
  await set_repo.create(workout_set, flush=True)

  return WorkoutSetSchema.model_validate(workout_set)


@router.patch(
  "/{workout_id}/sets/{set_id}",
  summary="Update Set",
  response_model=WorkoutSetSchema,
)
async def update_workout_set(
  workout_id: UUID,
  set_id: UUID,
  body: WorkoutSetUpdate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> WorkoutSetSchema:
  set_repo = WorkoutSetRepository.from_session(session)
  workout_set = await set_repo.get_by_id(set_id)
  if workout_set is None or workout_set.workout_log_id != workout_id:
    raise ResourceNotFound("Set not found")

  update_dict = body.model_dump(exclude_unset=True)
  if update_dict:
    await set_repo.update(workout_set, update_dict=update_dict)
    if "weight" in update_dict or "reps" in update_dict:
      workout_service.compute_e1rm(workout_set)
      await workout_service.check_and_flag_pr(session, workout_set)

  return WorkoutSetSchema.model_validate(workout_set)


@router.delete(
  "/{workout_id}/sets/{set_id}",
  summary="Delete Set",
  status_code=204,
)
async def delete_workout_set(
  workout_id: UUID,
  set_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
  set_repo = WorkoutSetRepository.from_session(session)
  workout_set = await set_repo.get_by_id(set_id)
  if workout_set is None or workout_set.workout_log_id != workout_id:
    raise ResourceNotFound("Set not found")
  await session.delete(workout_set)


# --- Last Session (Ghost Data) ---


@router.get(
  "/exercises/{exercise_id}/last-session",
  summary="Get Last Session for Exercise",
  response_model=LastSessionResponse,
)
async def get_last_session(
  exercise_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> LastSessionResponse:
  set_repo = WorkoutSetRepository.from_session(session)

  last_sets = await set_repo.get_last_session_sets(exercise_id)

  sets = [
    LastSessionSetSchema(
      set_number=s.set_number,
      weight=s.weight,
      reps=s.reps,
      weight_unit=s.weight_unit,
      rir=s.rir,
      set_type=s.set_type,
    )
    for s in last_sets
  ]

  best_set = None
  if last_sets:
    heaviest = max(last_sets, key=lambda s: s.weight)
    best_set = LastSessionBestSet(weight=heaviest.weight, reps=heaviest.reps, weight_unit=heaviest.weight_unit)

  return LastSessionResponse(sets=sets, best_set=best_set)


# --- PRs ---


@router.get(
  "/exercises/{exercise_id}/prs",
  summary="Get PRs for Exercise",
  response_model=ExercisePRListResponse,
)
async def get_exercise_prs(
  exercise_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ExercisePRListResponse:
  exercise_repo = ExerciseRepository.from_session(session)
  set_repo = WorkoutSetRepository.from_session(session)

  exercise = await exercise_repo.get_by_id(exercise_id)
  if exercise is None:
    raise ResourceNotFound("Exercise not found")

  best_sets = await set_repo.get_best_sets_for_exercise(exercise_id)

  prs = [
    ExercisePRSchema(
      exercise_id=exercise_id,
      exercise_name=exercise.name,
      reps=s.reps,
      weight=s.weight,
      weight_unit=s.weight_unit,
      achieved_at=s.created_at,
    )
    for s in best_sets
  ]

  return ExercisePRListResponse(items=prs)
