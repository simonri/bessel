from typing import Annotated

from fastapi import APIRouter, Depends

from api.common.pagination import PaginationParamsQuery
from api.healthkit.repository import HealthKitWorkoutRepository
from api.healthkit.schemas import HealthKitWorkoutListResponse, HealthKitWorkoutSchema, HealthKitWorkoutSyncRequest, HealthKitWorkoutSyncResponse
from api.healthkit.service import healthkit_workout_service
from api.postgres import AsyncSession, get_db_session
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/healthkit", tags=["healthkit"])


@router.post(
  "/workouts/sync",
  summary="Sync HealthKit Workouts",
  response_model=HealthKitWorkoutSyncResponse,
)
async def sync_healthkit_workouts(
  body: HealthKitWorkoutSyncRequest,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> HealthKitWorkoutSyncResponse:
  if not body.workouts and not body.deleted_uuids:
    return HealthKitWorkoutSyncResponse(synced=0, deleted=0)

  repo = HealthKitWorkoutRepository.from_session(session)
  synced, deleted = await healthkit_workout_service.sync(repo, current_user.id, body)
  return HealthKitWorkoutSyncResponse(synced=synced, deleted=deleted)


@router.get(
  "/workouts",
  summary="List HealthKit Workouts",
  response_model=HealthKitWorkoutListResponse,
)
async def list_healthkit_workouts(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  pagination: PaginationParamsQuery,
) -> HealthKitWorkoutListResponse:
  repo = HealthKitWorkoutRepository.from_session(session)
  statement = repo.get_list_statement(current_user.id)
  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  return HealthKitWorkoutListResponse.from_paginated_results(
    [HealthKitWorkoutSchema.model_validate(item) for item in items],
    total_count,
    pagination,
  )
