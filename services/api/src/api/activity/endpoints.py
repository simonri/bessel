import time
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.dialects.postgresql import insert

from api.activity.repository import ActivityRepository
from api.activity.schemas import (
    ActivityBatchRequest,
    ActivityBatchResponse,
    ActivityAppSummary,
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

    stmt = (
        insert(ActivityEvent)
        .values(rows)
        .on_conflict_do_nothing(constraint="activity_events_source_local_id_key")
        .returning(ActivityEvent.id)
    )

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
