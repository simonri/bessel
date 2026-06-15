from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.dialects.postgresql import insert

from api.activity.schemas import ActivityBatchRequest, ActivityBatchResponse
from api.models.activity_event import ActivityEvent
from api.postgres import AsyncSession, get_db_session

router = APIRouter(prefix="/activity", tags=["activity"])


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
