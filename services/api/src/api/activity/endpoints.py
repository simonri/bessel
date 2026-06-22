import time
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
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
from api.models.activity_event import ActivityEvent
from api.postgres import AsyncSession, get_db_session

router = APIRouter(prefix="/activity", tags=["activity"])

# Events are written at most every HEARTBEAT_SECS (300s); cap inter-event gaps
# at 2× that so tracker downtime / suspend gaps don't inflate totals.
_MAX_GAP_SECS = 600


@router.post(
  "/batch",
  summary="Ingest Activity Events",
  response_model=ActivityBatchResponse,
  status_code=200,
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
  start_ts: Annotated[int, Query(description="Start of time window (Unix epoch seconds, inclusive).")],
  end_ts: Annotated[int, Query(description="End of time window (Unix epoch seconds, exclusive).")],
  source: Annotated[str, Query(description="Machine source to query.")],
) -> ActivitySummaryResponse:
  repo = ActivityRepository.from_session(session)
  events = await repo.get_events_in_range(start_ts, end_ts, source)
  sources = await repo.get_sources()

  # tail_ts: for an ongoing window (today) cap at now; for past windows use end_ts.
  tail_ts = min(int(time.time()), end_ts)

  totals: dict[str, int] = {}
  total_active = 0

  for i, event in enumerate(events):
    nxt_ts = events[i + 1].ts if i + 1 < len(events) else tail_ts
    dur = min(nxt_ts - event.ts, _MAX_GAP_SECS)
    if event.state == "active" and dur > 0:
      key = event.app_class or "(unknown)"
      totals[key] = totals.get(key, 0) + dur
      total_active += dur

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
  start_ts: Annotated[int, Query(description="Start of range (Unix epoch seconds, inclusive).")],
  end_ts: Annotated[int, Query(description="End of range (Unix epoch seconds, exclusive).")],
  source: Annotated[str, Query(description="Machine source to query.")],
  tz_offset_mins: Annotated[int, Query(description="Local UTC offset in minutes (e.g. 120 for UTC+2).")] = 0,
) -> ActivityDailyResponse:
  repo = ActivityRepository.from_session(session)
  events = await repo.get_events_in_range(start_ts, end_ts, source)

  tail_ts = min(int(time.time()), end_ts)
  tz_offset_secs = tz_offset_mins * 60
  daily: dict[str, int] = {}

  for i, event in enumerate(events):
    nxt_ts = events[i + 1].ts if i + 1 < len(events) else tail_ts
    dur = min(nxt_ts - event.ts, _MAX_GAP_SECS)
    if event.state == "active" and dur > 0:
      local_ts = event.ts + tz_offset_secs
      day_str = datetime.fromtimestamp(local_ts, tz=UTC).date().isoformat()
      daily[day_str] = daily.get(day_str, 0) + dur

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
  start_ts: Annotated[int, Query(description="Start of window (Unix epoch seconds, inclusive).")],
  end_ts: Annotated[int, Query(description="End of window (Unix epoch seconds, exclusive).")],
  source: Annotated[str, Query(description="Machine source to query.")],
  bucket_mins: Annotated[int, Query(description="Bucket size in minutes.", ge=1, le=60)] = 15,
) -> ActivityIntradayResponse:
  repo = ActivityRepository.from_session(session)
  events = await repo.get_events_in_range(start_ts, end_ts, source)

  tail_ts = min(int(time.time()), end_ts)
  bucket_secs = bucket_mins * 60
  total_buckets = (end_ts - start_ts) // bucket_secs
  buckets: dict[int, int] = {}

  for i, event in enumerate(events):
    nxt_ts = events[i + 1].ts if i + 1 < len(events) else tail_ts
    dur = min(nxt_ts - event.ts, _MAX_GAP_SECS)
    if event.state == "active" and dur > 0:
      bucket_idx = (event.ts - start_ts) // bucket_secs
      bucket_idx = min(bucket_idx, total_buckets - 1)
      buckets[bucket_idx] = buckets.get(bucket_idx, 0) + dur

  result = sorted(
    [ActivityIntradayBucket(bucket=k, active_secs=v) for k, v in buckets.items()],
    key=lambda x: x.bucket,
  )
  return ActivityIntradayResponse(
    bucket_mins=bucket_mins,
    total_buckets=total_buckets,
    buckets=result,
  )
