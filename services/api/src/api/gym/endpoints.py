from datetime import date
from uuid import UUID

from fastapi import APIRouter

from api.gym.repository import GymExerciseRepository, GymTopSetRepository
from api.gym.schemas import GymExerciseListResponse, GymExerciseSchema, GymExerciseUpsert, GymTopSetListResponse, GymTopSetSchema, GymTopSetUpsert
from api.gym.service import gym_service
from api.postgres import DBSession
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/gym", tags=["gym"])


@router.get(
  "/exercises",
  summary="List Gym Exercises",
  response_model=GymExerciseListResponse,
)
async def list_gym_exercises(session: DBSession, current_user: CurrentDBUser) -> GymExerciseListResponse:
  exercises = await gym_service.list_exercises(GymExerciseRepository.from_session(session), GymTopSetRepository.from_session(session), current_user.id)
  return GymExerciseListResponse(exercises=exercises)


@router.put(
  "/exercises/{exercise_id}",
  summary="Create or Rename Gym Exercise",
  response_model=GymExerciseSchema,
)
async def upsert_gym_exercise(exercise_id: UUID, body: GymExerciseUpsert, session: DBSession, current_user: CurrentDBUser) -> GymExerciseSchema:
  """The id is chosen by the app, so creating twice is the same as creating once."""
  exercise = await gym_service.upsert_exercise(GymExerciseRepository.from_session(session), exercise_id, current_user.id, body)
  return GymExerciseSchema.model_validate(exercise)


@router.delete(
  "/exercises/{exercise_id}",
  summary="Delete Gym Exercise",
  status_code=204,
)
async def delete_gym_exercise(exercise_id: UUID, session: DBSession, current_user: CurrentDBUser) -> None:
  await gym_service.delete_exercise(GymExerciseRepository.from_session(session), exercise_id, current_user.id)


@router.get(
  "/exercises/{exercise_id}/sets",
  summary="List Gym Top Sets",
  response_model=GymTopSetListResponse,
)
async def list_gym_top_sets(exercise_id: UUID, session: DBSession, current_user: CurrentDBUser) -> GymTopSetListResponse:
  exercise = await gym_service.get_exercise(GymExerciseRepository.from_session(session), exercise_id, current_user.id)
  sets = await GymTopSetRepository.from_session(session).list_for_exercise(exercise)
  return GymTopSetListResponse(sets=[GymTopSetSchema(performed_on=s.performed_on, weight_kg=float(s.weight_kg)) for s in sets])


@router.put(
  "/exercises/{exercise_id}/sets/{performed_on}",
  summary="Set Gym Top Set",
  response_model=GymTopSetSchema,
)
async def put_gym_top_set(exercise_id: UUID, performed_on: date, body: GymTopSetUpsert, session: DBSession, current_user: CurrentDBUser) -> GymTopSetSchema:
  """The day's top set for the exercise, replacing one already logged. The day
  is the app's local date, so a set sent late still lands on the day it was lifted."""
  exercise = await gym_service.get_exercise(GymExerciseRepository.from_session(session), exercise_id, current_user.id)
  top_set = await GymTopSetRepository.from_session(session).upsert(exercise, performed_on, body.weight_kg)
  return GymTopSetSchema(performed_on=top_set.performed_on, weight_kg=float(top_set.weight_kg))


@router.delete(
  "/exercises/{exercise_id}/sets/{performed_on}",
  summary="Delete Gym Top Set",
  status_code=204,
)
async def delete_gym_top_set(exercise_id: UUID, performed_on: date, session: DBSession, current_user: CurrentDBUser) -> None:
  exercise = await gym_service.get_exercise(GymExerciseRepository.from_session(session), exercise_id, current_user.id)
  await gym_service.delete_set(GymTopSetRepository.from_session(session), exercise, performed_on)
