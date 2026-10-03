from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, UploadFile

from api.common.uploads import read_upload
from api.location_history.repository import LocationImportRepository, LocationSegmentRepository
from api.location_history.schemas import LocationDay, LocationHistorySummary, LocationImportSchema
from api.location_history.service import location_history_service
from api.postgres import AsyncSession, get_db_session
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/location-history", tags=["location-history"])

# Android exports carry raw signals too and run to tens of MB.
MAX_IMPORT_SIZE_BYTES = 200 * 1024 * 1024


@router.post(
  "/import",
  summary="Import Google Timeline",
  response_model=LocationImportSchema,
)
async def import_location_history(
  file: UploadFile,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> LocationImportSchema:
  """Import a Timeline.json from Google Maps' "Export Timeline data".

  Safe to repeat: segments already stored are left as they are, edited ones
  are updated, and ones the phone no longer has within the export's span are
  removed. An export older than what's stored never overrides it.
  """
  content = await read_upload(file, MAX_IMPORT_SIZE_BYTES, "File is too large (max 200 MB).")
  record = await location_history_service.import_export(
    LocationSegmentRepository.from_session(session),
    LocationImportRepository.from_session(session),
    current_user.id,
    content,
    file.filename,
  )
  return LocationImportSchema.model_validate(record)


@router.get(
  "/summary",
  summary="Get Location History Summary",
  response_model=LocationHistorySummary,
)
async def get_location_history_summary(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> LocationHistorySummary:
  return await location_history_service.summary(
    LocationSegmentRepository.from_session(session),
    LocationImportRepository.from_session(session),
    current_user.id,
  )


@router.get(
  "/day",
  summary="Get Location History Day",
  response_model=LocationDay,
)
async def get_location_history_day(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  day: Annotated[date, Query(alias="date", description="Local date where the segments happened.")],
) -> LocationDay:
  return await location_history_service.day(LocationSegmentRepository.from_session(session), current_user.id, day)
