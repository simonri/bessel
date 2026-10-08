from datetime import UTC, date, datetime
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Query

from api.common.pagination import PaginationParamsQuery
from api.common.utils import utc_now
from api.exceptions import ValidationError
from api.healthkit.repository import HealthKitDailyMetricRepository, HealthKitSleepSampleRepository, HealthKitWorkoutRepository
from api.healthkit.schemas import (
  HealthKitDailyMetricsSyncRequest,
  HealthKitDailyMetricsSyncResponse,
  HealthKitSleepListResponse,
  HealthKitSleepSampleSchema,
  HealthKitSleepSyncRequest,
  HealthKitSleepSyncResponse,
  HealthKitWorkoutListResponse,
  HealthKitWorkoutSchema,
  HealthKitWorkoutSyncRequest,
  HealthKitWorkoutSyncResponse,
  HealthSummaryResponse,
  SleepDailyResponse,
  SleepSummaryResponse,
)
from api.healthkit.service import health_summary_service, healthkit_daily_metric_service, healthkit_sleep_service, healthkit_workout_service
from api.postgres import DBSession
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/healthkit", tags=["healthkit"])


@router.post(
  "/workouts/sync",
  summary="Sync HealthKit Workouts",
  response_model=HealthKitWorkoutSyncResponse,
)
async def sync_healthkit_workouts(
  body: HealthKitWorkoutSyncRequest,
  session: DBSession,
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
  session: DBSession,
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
  session: DBSession,
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
  session: DBSession,
  current_user: CurrentDBUser,
  pagination: PaginationParamsQuery,
  start_ts: Annotated[int | None, Query(description="Only samples ending after this (Unix epoch seconds).")] = None,
  end_ts: Annotated[int | None, Query(description="Only samples starting before this (Unix epoch seconds).")] = None,
) -> HealthKitSleepListResponse:
  repo = HealthKitSleepSampleRepository.from_session(session)
  statement = repo.get_list_statement(
    current_user.id,
    start=datetime.fromtimestamp(start_ts, tz=UTC) if start_ts is not None else None,
    end=datetime.fromtimestamp(end_ts, tz=UTC) if end_ts is not None else None,
  )
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
  session: DBSession,
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
  session: DBSession,
  current_user: CurrentDBUser,
  start_ts: Annotated[int, Query(description="Start of window (Unix epoch seconds, inclusive).")],
  end_ts: Annotated[int, Query(description="End of window (Unix epoch seconds, exclusive).")],
) -> SleepSummaryResponse:
  return await healthkit_sleep_service.stage_summary(HealthKitSleepSampleRepository.from_session(session), current_user.id, start_ts, end_ts)


@router.post(
  "/daily-metrics/sync",
  summary="Sync HealthKit Daily Metrics",
  response_model=HealthKitDailyMetricsSyncResponse,
)
async def sync_healthkit_daily_metrics(
  body: HealthKitDailyMetricsSyncRequest,
  session: DBSession,
  current_user: CurrentDBUser,
) -> HealthKitDailyMetricsSyncResponse:
  synced = await healthkit_daily_metric_service.sync(HealthKitDailyMetricRepository.from_session(session), current_user.id, body)
  return HealthKitDailyMetricsSyncResponse(synced=synced)


@router.get(
  "/summary",
  summary="Get Health Day Summary",
  response_model=HealthSummaryResponse,
)
async def get_health_summary(
  session: DBSession,
  current_user: CurrentDBUser,
  day: Annotated[date, Query(alias="date", description="Local date to summarize. Its sleep is the night that ended that morning.")],
  tz_name: Annotated[str, Query(description="IANA timezone name, e.g. 'Europe/Stockholm'.")],
) -> HealthSummaryResponse:
  tz = _parse_tz(tz_name)
  assert tz is not None
  now = utc_now()
  if day > now.astimezone(tz).date():
    raise ValidationError("That day hasn't happened yet.", status_code=422)
  return await health_summary_service.build(
    HealthKitSleepSampleRepository.from_session(session),
    HealthKitWorkoutRepository.from_session(session),
    HealthKitDailyMetricRepository.from_session(session),
    current_user.id,
    day,
    tz,
    now,
  )
