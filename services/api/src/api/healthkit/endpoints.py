from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Query

from api.common.pagination import PaginationParamsQuery
from api.exceptions import ValidationError
from api.healthkit.repository import HealthKitSleepSampleRepository, HealthKitWorkoutRepository
from api.healthkit.schemas import (
  HealthKitSleepListResponse,
  HealthKitSleepSampleSchema,
  HealthKitSleepSyncRequest,
  HealthKitSleepSyncResponse,
  HealthKitWorkoutListResponse,
  HealthKitWorkoutSchema,
  HealthKitWorkoutSyncRequest,
  HealthKitWorkoutSyncResponse,
  SleepDailyResponse,
  SleepSummaryResponse,
)
from api.healthkit.service import healthkit_sleep_service, healthkit_workout_service
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


@router.post(
  "/sleep/sync",
  summary="Sync HealthKit Sleep Samples",
  response_model=HealthKitSleepSyncResponse,
)
async def sync_healthkit_sleep(
  body: HealthKitSleepSyncRequest,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> HealthKitSleepSyncResponse:
  if not body.samples and not body.deleted_uuids:
    return HealthKitSleepSyncResponse(synced=0, deleted=0)

  repo = HealthKitSleepSampleRepository.from_session(session)
  synced, deleted = await healthkit_sleep_service.sync(repo, current_user.id, body)
  return HealthKitSleepSyncResponse(synced=synced, deleted=deleted)


@router.get(
  "/sleep",
  summary="List HealthKit Sleep Samples",
  response_model=HealthKitSleepListResponse,
)
async def list_healthkit_sleep(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  pagination: PaginationParamsQuery,
) -> HealthKitSleepListResponse:
  repo = HealthKitSleepSampleRepository.from_session(session)
  statement = repo.get_list_statement(current_user.id)
  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  return HealthKitSleepListResponse.from_paginated_results(
    [HealthKitSleepSampleSchema.model_validate(item) for item in items],
    total_count,
    pagination,
  )


def _parse_tz(tz_name: str | None) -> ZoneInfo | None:
  try:
    return ZoneInfo(tz_name) if tz_name else None
  except (ZoneInfoNotFoundError, ValueError) as e:
    # Don't silently fall back to UTC — that would bucket nights on the wrong boundary.
    raise ValidationError(f"Unknown timezone: {tz_name}", status_code=422) from e


@router.get(
  "/sleep/daily",
  summary="Get Nightly Sleep Totals",
  response_model=SleepDailyResponse,
)
async def get_daily_sleep(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  start_ts: Annotated[int, Query(description="Start of range (Unix epoch seconds, inclusive).")],
  end_ts: Annotated[int, Query(description="End of range (Unix epoch seconds, exclusive).")],
  tz_name: Annotated[
    str | None, Query(description="IANA timezone name (e.g. 'Europe/Stockholm'). Preferred over tz_offset_mins; handles DST correctly.")
  ] = None,
  tz_offset_mins: Annotated[
    int, Query(description="Fallback UTC offset in minutes when tz_name is not provided (e.g. 120 for UTC+2). Does not handle DST.")
  ] = 0,
) -> SleepDailyResponse:
  repo = HealthKitSleepSampleRepository.from_session(session)
  nights = await healthkit_sleep_service.nightly_totals(repo, current_user.id, start_ts, end_ts, _parse_tz(tz_name), tz_offset_mins)
  return SleepDailyResponse(nights=nights)


@router.get(
  "/sleep/summary",
  summary="Get Sleep Stage Summary",
  response_model=SleepSummaryResponse,
)
async def get_sleep_summary(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  start_ts: Annotated[int, Query(description="Start of window (Unix epoch seconds, inclusive).")],
  end_ts: Annotated[int, Query(description="End of window (Unix epoch seconds, exclusive).")],
) -> SleepSummaryResponse:
  return await healthkit_sleep_service.stage_summary(HealthKitSleepSampleRepository.from_session(session), current_user.id, start_ts, end_ts)
