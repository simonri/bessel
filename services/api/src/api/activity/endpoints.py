from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.dialects.postgresql import insert

from api.activity.repository import ActivityRepository
from api.activity.schemas import (
  ActivityAppSummary,
  ActivityBatchRequest,
  ActivityBatchResponse,
  ActivityDailyEntry,
  ActivityDailyResponse,
  ActivityIntradayBucket,
  ActivityIntradayResponse,
  ActivitySourcesResponse,
  ActivitySummaryResponse,
)
from api.activity.service import ActivityService
from api.models.activity_event import ActivityEvent
from api.postgres import AsyncSession, get_db_session
from api.settings import settings
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/activity", tags=["activity"])


def _verify_internal_api_key(x_api_key: Annotated[str | None, Header()] = None) -> None:
  expected = settings.INTERNAL_API_KEY
  if not expected or x_api_key != expected:
    raise HTTPException(status_code=401, detail="Invalid or missing API key")


@router.post(
  "/batch",
  summary="Ingest Activity Events",
  response_model=ActivityBatchResponse,
  status_code=200,
  dependencies=[Depends(_verify_internal_api_key)],
)
async def ingest_activity_batch(
  body: ActivityBatchRequest,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ActivityBatchResponse:
  if not body.events:
    return ActivityBatchResponse(inserted=0, skipped=0)

  rows = [
    {
      "ts": ev.ts,
      "state": ev.state,
      "app_class": ev.app_class,
      "title": ev.title,
      "workspace": ev.workspace,
      "source": body.source,
      "local_id": ev.local_id,
    }
    for ev in body.events
  ]

  stmt = insert(ActivityEvent).values(rows).on_conflict_do_nothing(constraint="activity_events_source_local_id_key").returning(ActivityEvent.id)

  result = await session.execute(stmt)
  inserted = len(result.fetchall())
  skipped = len(rows) - inserted

  return ActivityBatchResponse(inserted=inserted, skipped=skipped)


@router.get(
  "/sources",
  summary="List Activity Sources",
  response_model=ActivitySourcesResponse,
)
async def list_activity_sources(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> ActivitySourcesResponse:
  repo = ActivityRepository.from_session(session)
  sources = await repo.get_sources()
  return ActivitySourcesResponse(sources=sources)


@router.get(
  "/summary",
  summary="Get Activity Summary",
  response_model=ActivitySummaryResponse,
)
async def get_activity_summary(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  start_ts: Annotated[int, Query(description="Start of time window (Unix epoch seconds, inclusive).")],
  end_ts: Annotated[int, Query(description="End of time window (Unix epoch seconds, exclusive).")],
  source: Annotated[str, Query(description="Machine source to query.")],
) -> ActivitySummaryResponse:
  repo = ActivityRepository.from_session(session)
  service = ActivityService()
  segments = await service.get_active_segments(repo, source, start_ts, end_ts)
  sources = await repo.get_sources()

  totals: dict[str, int] = {}
  total_active = 0

  for seg in segments:
    key = seg.app_class or "(unknown)"
    totals[key] = totals.get(key, 0) + seg.duration
    total_active += seg.duration

  apps = sorted(
    [
      ActivityAppSummary(
        app_class=k,
        active_secs=v,
        percentage=v / total_active * 100 if total_active > 0 else 0.0,
      )
      for k, v in totals.items()
    ],
    key=lambda x: -x.active_secs,
  )

  return ActivitySummaryResponse(
    source=source,
    sources=sources,
    total_active_secs=total_active,
    apps=apps,
  )


@router.get(
  "/daily",
  summary="Get Daily Activity Totals",
  response_model=ActivityDailyResponse,
)
async def get_daily_activity(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  start_ts: Annotated[int, Query(description="Start of range (Unix epoch seconds, inclusive).")],
  end_ts: Annotated[int, Query(description="End of range (Unix epoch seconds, exclusive).")],
  source: Annotated[str, Query(description="Machine source to query.")],
  tz_name: Annotated[
    str | None, Query(description="IANA timezone name (e.g. 'Europe/Stockholm'). Preferred over tz_offset_mins; handles DST correctly.")
  ] = None,
  tz_offset_mins: Annotated[
    int, Query(description="Fallback UTC offset in minutes when tz_name is not provided (e.g. 120 for UTC+2). Does not handle DST.")
  ] = 0,
) -> ActivityDailyResponse:
  try:
    tz = ZoneInfo(tz_name) if tz_name else None
  except (ZoneInfoNotFoundError, ValueError) as e:
    # Don't silently fall back to UTC — that would bucket days on the wrong boundary.
    raise HTTPException(status_code=422, detail=f"Unknown timezone: {tz_name}") from e

  repo = ActivityRepository.from_session(session)
  service = ActivityService()
  segments = await service.get_active_segments(repo, source, start_ts, end_ts)

  daily: dict[str, int] = {}
  for seg in segments:
    for day_str, secs in service.split_by_local_day(seg, tz, tz_offset_mins):
      daily[day_str] = daily.get(day_str, 0) + secs

  days = sorted(
    [ActivityDailyEntry(date=k, active_secs=v) for k, v in daily.items()],
    key=lambda x: x.date,
  )
  return ActivityDailyResponse(days=days)


@router.get(
  "/intraday",
  summary="Get Intraday Activity",
  response_model=ActivityIntradayResponse,
)
async def get_intraday_activity(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  start_ts: Annotated[int, Query(description="Start of window (Unix epoch seconds, inclusive).")],
  end_ts: Annotated[int, Query(description="End of window (Unix epoch seconds, exclusive).")],
  source: Annotated[str, Query(description="Machine source to query.")],
  bucket_mins: Annotated[int, Query(description="Bucket size in minutes.", ge=1, le=60)] = 15,
) -> ActivityIntradayResponse:
  repo = ActivityRepository.from_session(session)
  service = ActivityService()
  segments = await service.get_active_segments(repo, source, start_ts, end_ts)

  bucket_secs = bucket_mins * 60
  total_buckets = (end_ts - start_ts) // bucket_secs
  buckets: dict[int, int] = {}

  for seg in segments:
    bucket_idx = (seg.start_ts - start_ts) // bucket_secs
    bucket_idx = min(bucket_idx, total_buckets - 1)
    buckets[bucket_idx] = buckets.get(bucket_idx, 0) + seg.duration

  result = sorted(
    [ActivityIntradayBucket(bucket=k, active_secs=v) for k, v in buckets.items()],
    key=lambda x: x.bucket,
  )
  return ActivityIntradayResponse(
    bucket_mins=bucket_mins,
    total_buckets=total_buckets,
    buckets=result,
  )
