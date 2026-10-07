from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

import httpx
import structlog
from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import StreamingResponse

from api.auth.dependencies import CurrentUser
from api.calendars import push
from api.calendars.editing import calendar_edit_service
from api.calendars.edits import EditScope
from api.calendars.providers import ProviderAuthError
from api.calendars.repository import CalendarAccountRepository, CalendarEventRepository, CalendarPersonRepository, CalendarRepository
from api.calendars.schemas import (
  CalendarAccountListResponse,
  CalendarAccountSchema,
  CalendarEventListResponse,
  CalendarSchema,
  CalendarUpdate,
  EventCreate,
  EventReplyUpdate,
  EventUpdate,
  EventWriteResponse,
  GoogleAuthorizeResponse,
  GoogleCallbackRequest,
  ICloudConnectRequest,
)
from api.calendars.service import OAuthCallbackError, calendar_service
from api.exceptions import ServiceUnavailableError, TooManyRequestsError, ValidationError
from api.logging import Logger
from api.models.calendar_event import CalendarEvent
from api.postgres import AsyncSession, DBSession
from api.redis import Redis, get_redis
from api.users.dependencies import CurrentDBUser
from api.users.service import user_service

log: Logger = structlog.get_logger()

router = APIRouter(prefix="/calendars", tags=["calendars"])

MAX_EVENT_WINDOW_SECS = 62 * 86400


@router.get("/accounts", summary="List Calendar Accounts", response_model=CalendarAccountListResponse)
async def list_calendar_accounts(
  session: DBSession,
  current_user: CurrentDBUser,
) -> CalendarAccountListResponse:
  accounts = await CalendarAccountRepository.from_session(session).list_for_user(current_user.id)
  return CalendarAccountListResponse(accounts=[CalendarAccountSchema.model_validate(a) for a in accounts])


@router.post("/google/authorize", summary="Start Google Calendar Connection", response_model=GoogleAuthorizeResponse)
async def authorize_google(current_user: CurrentDBUser) -> GoogleAuthorizeResponse:
  return GoogleAuthorizeResponse(url=calendar_service.google_authorize_url(current_user.id))


@router.post("/google/webhook", include_in_schema=False)
async def google_calendar_webhook(
  request: Request,
  session: DBSession,
  redis: Annotated[Redis, Depends(get_redis)],
) -> Response:
  """Google's change notifications. Unauthenticated by design: each channel's
  secret token, checked in the handler, is what proves a call is genuine."""
  await push.handle_google_notification(CalendarRepository.from_session(session), redis, push.GoogleNotification.from_headers(request.headers))
  return Response(status_code=200)


async def _stream_user_id(
  user_info: CurrentUser,
  # Committed, returning its connection, before streaming starts: a page keeps
  # this stream open for up to an hour.
  session: DBSession,
) -> UUID:
  return (await user_service.get_or_create_by_sub(session, user_info.sub, user_info.email)).id


@router.get("/changes", include_in_schema=False)
async def stream_calendar_changes(
  user_id: Annotated[UUID, Depends(_stream_user_id)],
  redis: Annotated[Redis, Depends(get_redis)],
) -> StreamingResponse:
  """Server-sent `changed` events whenever a sync of the user's calendars lands."""
  try:
    slot = await push.claim_stream_slot(redis, user_id)
  except push.TooManyStreamsError as e:
    raise TooManyRequestsError("Too many open calendar update streams. Close some Bessel windows and try again.") from e
  return StreamingResponse(
    push.change_events(redis, user_id, slot=slot),
    media_type="text/event-stream",
    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
  )


@router.post("/google/callback", summary="Complete Google Calendar Connection", response_model=CalendarAccountSchema, status_code=201)
async def complete_google_connect(
  body: GoogleCallbackRequest,
  session: DBSession,
  current_user: CurrentDBUser,
) -> CalendarAccountSchema:
  accounts = CalendarAccountRepository.from_session(session)
  try:
    account = await calendar_service.complete_google_connect(accounts, current_user.id, code=body.code, state=body.state)
  except OAuthCallbackError as e:
    raise ValidationError(str(e)) from e
  except (httpx.HTTPError, ProviderAuthError) as e:
    log.exception("google_calendar_connect_failed")
    raise ServiceUnavailableError("Google couldn't complete the sign-in. Try again from Bessel.", status_code=502) from e
  return CalendarAccountSchema.model_validate(await accounts.get_owned(account.id, current_user.id))


@router.post("/icloud", summary="Connect iCloud Calendar", response_model=CalendarAccountSchema, status_code=201)
async def connect_icloud(
  body: ICloudConnectRequest,
  session: DBSession,
  current_user: CurrentDBUser,
) -> CalendarAccountSchema:
  accounts = CalendarAccountRepository.from_session(session)
  account = await calendar_service.connect_icloud(accounts, current_user.id, apple_id=body.apple_id.strip(), app_password=body.app_password.strip())
  return CalendarAccountSchema.model_validate(await accounts.get_owned(account.id, current_user.id))


@router.delete("/accounts/{account_id}", summary="Disconnect Calendar Account", status_code=204)
async def disconnect_calendar_account(
  account_id: UUID,
  session: DBSession,
  current_user: CurrentDBUser,
) -> None:
  accounts = CalendarAccountRepository.from_session(session)
  await calendar_service.disconnect(accounts, await accounts.get_owned(account_id, current_user.id))


@router.post("/accounts/{account_id}/sync", summary="Sync Calendar Account", status_code=202)
async def sync_calendar_account(
  account_id: UUID,
  session: DBSession,
  current_user: CurrentDBUser,
) -> None:
  account = await CalendarAccountRepository.from_session(session).get_owned(account_id, current_user.id)
  calendar_service.request_sync(account.id)


@router.patch("/{calendar_id}", summary="Update Calendar", response_model=CalendarSchema)
async def update_calendar(
  calendar_id: UUID,
  body: CalendarUpdate,
  session: DBSession,
  current_user: CurrentDBUser,
) -> CalendarSchema:
  calendar = await CalendarRepository.from_session(session).get_owned(calendar_id, current_user.id)
  calendar.hidden = body.hidden
  return CalendarSchema.model_validate(calendar)


@router.get("/events", summary="List Calendar Events", response_model=CalendarEventListResponse)
async def list_calendar_events(
  session: DBSession,
  current_user: CurrentDBUser,
  start_ts: Annotated[int, Query(description="Start of window (Unix epoch seconds, inclusive).")],
  end_ts: Annotated[int, Query(description="End of window (Unix epoch seconds, exclusive).")],
) -> CalendarEventListResponse:
  if not 0 < end_ts - start_ts <= MAX_EVENT_WINDOW_SECS:
    raise ValidationError("Window must be positive and at most 62 days", status_code=422)
  events = await CalendarEventRepository.from_session(session).list_in_range(
    current_user.id,
    datetime.fromtimestamp(start_ts, tz=UTC),
    datetime.fromtimestamp(end_ts, tz=UTC),
  )
  return CalendarEventListResponse(events=await calendar_service.event_schemas(CalendarPersonRepository.from_session(session), current_user.id, events))


async def _write_response(session: AsyncSession, user_id: UUID, event: CalendarEvent | None) -> EventWriteResponse:
  if event is None:
    return EventWriteResponse(event=None)
  [schema] = await calendar_service.event_schemas(CalendarPersonRepository.from_session(session), user_id, [event])
  return EventWriteResponse(event=schema)


@router.post("/{calendar_id}/events", summary="Create Calendar Event", response_model=EventWriteResponse, status_code=201)
async def create_calendar_event(
  calendar_id: UUID,
  body: EventCreate,
  session: DBSession,
  redis: Annotated[Redis, Depends(get_redis)],
  current_user: CurrentDBUser,
) -> EventWriteResponse:
  event = await calendar_edit_service.create_event(session, redis, current_user.id, calendar_id, body)
  return await _write_response(session, current_user.id, event)


@router.patch("/events/{event_id}", summary="Update Calendar Event", response_model=EventWriteResponse)
async def update_calendar_event(
  event_id: UUID,
  body: EventUpdate,
  session: DBSession,
  redis: Annotated[Redis, Depends(get_redis)],
  current_user: CurrentDBUser,
) -> EventWriteResponse:
  event = await calendar_edit_service.update_event(session, redis, current_user.id, event_id, body)
  return await _write_response(session, current_user.id, event)


@router.put("/events/{event_id}/response", summary="Answer Calendar Invitation", response_model=EventWriteResponse)
async def respond_to_calendar_event(
  event_id: UUID,
  body: EventReplyUpdate,
  session: DBSession,
  redis: Annotated[Redis, Depends(get_redis)],
  current_user: CurrentDBUser,
) -> EventWriteResponse:
  event = await calendar_edit_service.respond_to_event(session, redis, current_user.id, event_id, body)
  return await _write_response(session, current_user.id, event)


@router.delete("/events/{event_id}", summary="Delete Calendar Event", status_code=204)
async def delete_calendar_event(
  event_id: UUID,
  session: DBSession,
  redis: Annotated[Redis, Depends(get_redis)],
  current_user: CurrentDBUser,
  time_zone: Annotated[str, Query(description="Zone the user is viewing the calendar in.")],
  scope: Annotated[EditScope, Query(description="For repeating events: this occurrence, this and following, or all.")] = EditScope.this,
  notify_guests: Annotated[bool, Query(description="Email guests a cancellation (Google only).")] = True,
) -> None:
  await calendar_edit_service.delete_event(session, redis, current_user.id, event_id, scope, time_zone=time_zone, notify_guests=notify_guests)
