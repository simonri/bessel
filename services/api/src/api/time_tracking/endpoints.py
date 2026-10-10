from datetime import datetime
from typing import Annotated
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Query

from api.common.utils import utc_now
from api.exceptions import ValidationError
from api.models.time_tracking import TimeProject
from api.postgres import DBSession
from api.time_tracking.repository import TimeEntryRepository, TimeProjectRepository
from api.time_tracking.schemas import (
  TimeEntryCreate,
  TimeEntrySchema,
  TimeEntryUpdate,
  TimeProjectCreate,
  TimeProjectSchema,
  TimeProjectUpdate,
  TimeSummarySchema,
)
from api.time_tracking.service import TimeTrackingService
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/time", tags=["time"])

time_tracking_service = TimeTrackingService()


@router.get("/projects", summary="List Time Projects", response_model=list[TimeProjectSchema])
async def list_time_projects(session: DBSession, current_user: CurrentDBUser) -> list[TimeProjectSchema]:
  projects = await TimeProjectRepository.from_session(session).list_for_user(current_user.id)
  return [TimeProjectSchema.model_validate(p) for p in projects]


@router.post("/projects", summary="Create Time Project", response_model=TimeProjectSchema, status_code=201)
async def create_time_project(session: DBSession, current_user: CurrentDBUser, body: TimeProjectCreate) -> TimeProjectSchema:
  project = TimeProject(user_id=current_user.id, **body.model_dump())
  project = await TimeProjectRepository.from_session(session).create(project, flush=True)
  return TimeProjectSchema.model_validate(project)


@router.patch("/projects/{project_id}", summary="Update Time Project", response_model=TimeProjectSchema)
async def update_time_project(session: DBSession, current_user: CurrentDBUser, project_id: UUID, body: TimeProjectUpdate) -> TimeProjectSchema:
  project = await TimeProjectRepository.from_session(session).get_owned_or_404(project_id, current_user.id, not_found_message="Project not found.")
  project = await time_tracking_service.update_project(session, project, body)
  return TimeProjectSchema.model_validate(project)


@router.get("/entries", summary="List Time Entries", response_model=list[TimeEntrySchema])
async def list_time_entries(
  session: DBSession,
  current_user: CurrentDBUser,
  start: Annotated[datetime, Query(description="Entries ending after this instant.")],
  end: Annotated[datetime, Query(description="Entries starting before this instant. At most two months after start.")],
) -> list[TimeEntrySchema]:
  entries = await time_tracking_service.list_entries(session, current_user.id, start, end)
  return [TimeEntrySchema.model_validate(e) for e in entries]


@router.post("/entries", summary="Create Time Entry", response_model=TimeEntrySchema, status_code=201)
async def create_time_entry(session: DBSession, current_user: CurrentDBUser, body: TimeEntryCreate) -> TimeEntrySchema:
  entry = await time_tracking_service.create_entry(session, current_user.id, body)
  return TimeEntrySchema.model_validate(entry)


@router.patch("/entries/{entry_id}", summary="Update Time Entry", response_model=TimeEntrySchema)
async def update_time_entry(session: DBSession, current_user: CurrentDBUser, entry_id: UUID, body: TimeEntryUpdate) -> TimeEntrySchema:
  entry = await TimeEntryRepository.from_session(session).get_owned_or_404(entry_id, current_user.id, not_found_message="Entry not found.")
  entry = await time_tracking_service.update_entry(session, entry, body)
  return TimeEntrySchema.model_validate(entry)


@router.delete("/entries/{entry_id}", summary="Delete Time Entry", status_code=204)
async def delete_time_entry(session: DBSession, current_user: CurrentDBUser, entry_id: UUID) -> None:
  repo = TimeEntryRepository.from_session(session)
  entry = await repo.get_owned_or_404(entry_id, current_user.id, not_found_message="Entry not found.")
  await repo.update(entry, update_dict={"deleted_at": utc_now()}, flush=True)


@router.get("/summary", summary="Get Monthly Time Totals", response_model=TimeSummarySchema)
async def get_time_summary(
  session: DBSession,
  current_user: CurrentDBUser,
  year: Annotated[int, Query(ge=2000, le=2100)],
  tz_name: Annotated[str, Query(description="IANA timezone the months are counted in.")],
) -> TimeSummarySchema:
  try:
    tz = ZoneInfo(tz_name)
  except (ZoneInfoNotFoundError, ValueError) as e:
    raise ValidationError(f"Unknown timezone: {tz_name}", status_code=422) from e
  totals = await time_tracking_service.summary(session, current_user.id, year, tz)
  return TimeSummarySchema(year=year, totals=totals)
