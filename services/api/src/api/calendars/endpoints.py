from datetime import UTC, datetime
from html import escape
from typing import Annotated
from uuid import UUID

import httpx
import structlog
from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse

from api.calendars.providers import ProviderAuthError
from api.calendars.repository import CalendarAccountRepository, CalendarEventRepository, CalendarRepository
from api.calendars.schemas import (
  CalendarAccountListResponse,
  CalendarAccountSchema,
  CalendarEventListResponse,
  CalendarEventSchema,
  CalendarSchema,
  CalendarUpdate,
  GoogleAuthorizeResponse,
  ICloudConnectRequest,
)
from api.calendars.service import OAuthCallbackError, calendar_service
from api.exceptions import ValidationError
from api.logging import Logger
from api.postgres import AsyncSession, get_db_session
from api.users.dependencies import CurrentDBUser

log: Logger = structlog.get_logger()

router = APIRouter(prefix="/calendars", tags=["calendars"])

MAX_EVENT_WINDOW_SECS = 62 * 86400


@router.get("/accounts", summary="List Calendar Accounts", response_model=CalendarAccountListResponse)
async def list_calendar_accounts(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> CalendarAccountListResponse:
  accounts = await CalendarAccountRepository.from_session(session).list_for_user(current_user.id)
  return CalendarAccountListResponse(accounts=[CalendarAccountSchema.model_validate(a) for a in accounts])


@router.post("/google/authorize", summary="Start Google Calendar Connection", response_model=GoogleAuthorizeResponse)
async def authorize_google(current_user: CurrentDBUser) -> GoogleAuthorizeResponse:
  return GoogleAuthorizeResponse(url=calendar_service.google_authorize_url(current_user.id))


def _callback_page(title: str, message: str, status_code: int = 200) -> HTMLResponse:
  body = f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>{escape(title)}</title>
<style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#111;color:#eee;font:15px system-ui,sans-serif}}
main{{max-width:28rem;padding:2rem;text-align:center}}h1{{font-size:18px;font-weight:600}}p{{color:#aaa;line-height:1.5}}</style></head>
<body><main><h1>{escape(title)}</h1><p>{escape(message)}</p></main></body></html>"""
  return HTMLResponse(body, status_code=status_code)


# Google redirects the browser here as a plain page load, so there's no bearer
# token: the user comes from the encrypted, short-lived `state` instead.
@router.get("/google/callback", include_in_schema=False)
async def google_callback(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  state: str = "",
  code: str | None = None,
  error: str | None = None,
) -> HTMLResponse:
  if error or not code:
    return _callback_page("Google Calendar not connected", "Access wasn't granted. You can close this tab.", 400)
  try:
    account = await calendar_service.complete_google_connect(CalendarAccountRepository.from_session(session), code=code, state=state)
  except OAuthCallbackError as e:
    return _callback_page("Google Calendar not connected", str(e), 400)
  except (httpx.HTTPError, ProviderAuthError):
    log.exception("google_calendar_connect_failed")
    return _callback_page("Google Calendar not connected", "Google couldn't complete the sign-in. Try again from Bessel.", 502)
  return _callback_page("Google Calendar connected", f"{account.email} is syncing to Bessel. You can close this tab.")


@router.post("/icloud", summary="Connect iCloud Calendar", response_model=CalendarAccountSchema, status_code=201)
async def connect_icloud(
  body: ICloudConnectRequest,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> CalendarAccountSchema:
  accounts = CalendarAccountRepository.from_session(session)
  account = await calendar_service.connect_icloud(accounts, current_user.id, apple_id=body.apple_id.strip(), app_password=body.app_password.strip())
  return CalendarAccountSchema.model_validate(await accounts.get_owned(account.id, current_user.id))


@router.delete("/accounts/{account_id}", summary="Disconnect Calendar Account", status_code=204)
async def disconnect_calendar_account(
  account_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> None:
  accounts = CalendarAccountRepository.from_session(session)
  await calendar_service.disconnect(accounts, await accounts.get_owned(account_id, current_user.id))


@router.post("/accounts/{account_id}/sync", summary="Sync Calendar Account", status_code=202)
async def sync_calendar_account(
  account_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> None:
  account = await CalendarAccountRepository.from_session(session).get_owned(account_id, current_user.id)
  calendar_service.request_sync(account.id)


@router.patch("/{calendar_id}", summary="Update Calendar", response_model=CalendarSchema)
async def update_calendar(
  calendar_id: UUID,
  body: CalendarUpdate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> CalendarSchema:
  calendar = await CalendarRepository.from_session(session).get_owned(calendar_id, current_user.id)
  calendar.hidden = body.hidden
  return CalendarSchema.model_validate(calendar)


@router.get("/events", summary="List Calendar Events", response_model=CalendarEventListResponse)
async def list_calendar_events(
  session: Annotated[AsyncSession, Depends(get_db_session)],
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
  return CalendarEventListResponse(events=[CalendarEventSchema.model_validate(e) for e in events])
