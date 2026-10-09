from typing import Annotated

from fastapi import APIRouter, Query

from api.activity.repository import ActivityRepository
from api.exceptions import ValidationError
from api.healthkit.repository import HealthKitSleepSampleRepository, HealthKitWorkoutRepository
from api.postgres import DBSession
from api.timeline.schemas import TimelineResponse
from api.timeline.service import timeline_service
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/timeline", tags=["timeline"])

MAX_WINDOW_SECS = 7 * 86400


@router.get(
  "",
  summary="Get Timeline",
  response_model=TimelineResponse,
)
async def get_timeline(
  session: DBSession,
  current_user: CurrentDBUser,
  start_ts: Annotated[int, Query(description="Start of window (Unix epoch seconds, inclusive).")],
  end_ts: Annotated[int, Query(description="End of window (Unix epoch seconds, exclusive).")],
  source: Annotated[str | None, Query(description="Activity source for the PC lane. Defaults to the most recently active source.")] = None,
) -> TimelineResponse:
  if not 0 < end_ts - start_ts <= MAX_WINDOW_SECS:
    raise ValidationError("Window must be positive and at most 7 days", status_code=422)

  return await timeline_service.get_timeline(
    ActivityRepository.from_session(session),
    HealthKitSleepSampleRepository.from_session(session),
    HealthKitWorkoutRepository.from_session(session),
    current_user.id,
    start_ts,
    end_ts,
    source,
  )
