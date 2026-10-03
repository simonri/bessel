import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

import httpx
import structlog

from api.calendars.google import GoogleCalendarClient, authorize_url
from api.calendars.icloud import ICloudCalendarClient
from api.calendars.providers import ProviderAuthError, ProviderCalendar, ProviderEvent
from api.calendars.repository import CalendarAccountRepository, CalendarEventRepository, CalendarRepository
from api.common.encryption import InvalidToken, decrypt, encrypt
from api.common.utils import utc_now
from api.exceptions import ServiceUnavailableError, ValidationError
from api.logging import Logger
from api.models.calendar import Calendar
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.settings import settings
from api.worker import enqueue_job

log: Logger = structlog.get_logger()

SYNC_PAST_DAYS = 90
SYNC_FUTURE_DAYS = 365
OAUTH_STATE_TTL_SECONDS = 600
HTTP_TIMEOUT_SECONDS = 30
SYNC_ACCOUNT_ACTOR = "sync_calendar_account"


class OAuthCallbackError(Exception):
  """Shown to the user on the callback page."""


@dataclass(frozen=True, slots=True)
class AccountSnapshot:
  calendars: list[ProviderCalendar]
  events: dict[str, list[ProviderEvent]]


def sync_window() -> tuple[datetime, datetime]:
  now = utc_now()
  return now - timedelta(days=SYNC_PAST_DAYS), now + timedelta(days=SYNC_FUTURE_DAYS)


def _require_google_config() -> None:
  if not settings.GOOGLE_OAUTH_CLIENT_ID or not settings.GOOGLE_OAUTH_CLIENT_SECRET:
    raise ServiceUnavailableError("Google Calendar is not configured on this server")


def _google_client(http: httpx.AsyncClient) -> GoogleCalendarClient:
  _require_google_config()
  return GoogleCalendarClient(http)


class CalendarService:
  def google_authorize_url(self, user_id: UUID) -> str:
    _require_google_config()
    state = encrypt(json.dumps({"user_id": str(user_id)}))
    return authorize_url(state)

  async def complete_google_connect(self, accounts: CalendarAccountRepository, *, code: str, state: str) -> CalendarAccount:
    try:
      user_id = UUID(json.loads(decrypt(state, ttl=OAUTH_STATE_TTL_SECONDS))["user_id"])
    except (InvalidToken, ValueError, KeyError) as e:
      raise OAuthCallbackError("This sign-in link has expired. Start again from Bessel.") from e

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as http:
      google = _google_client(http)
      access_token, refresh_token = await google.exchange_code(code)
      email = await google.get_email(access_token)

    account = await accounts.get_by_identity(user_id, CalendarProvider.google, email)
    if refresh_token is None and account is None:
      raise OAuthCallbackError("Google didn't grant offline access. Remove Bessel at myaccount.google.com/permissions and try again.")
    return await self._upsert_account(accounts, account, user_id, CalendarProvider.google, email, refresh_token)

  async def connect_icloud(self, accounts: CalendarAccountRepository, user_id: UUID, *, apple_id: str, app_password: str) -> CalendarAccount:
    try:
      async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as http:
        await ICloudCalendarClient(http, apple_id, app_password).list_calendars()
    except ProviderAuthError as e:
      raise ValidationError("iCloud rejected that Apple ID or app-specific password", status_code=422) from e
    except httpx.HTTPError as e:
      raise ServiceUnavailableError("iCloud didn't respond, try again") from e

    account = await accounts.get_by_identity(user_id, CalendarProvider.icloud, apple_id)
    return await self._upsert_account(accounts, account, user_id, CalendarProvider.icloud, apple_id, app_password)

  async def _upsert_account(
    self,
    accounts: CalendarAccountRepository,
    account: CalendarAccount | None,
    user_id: UUID,
    provider: CalendarProvider,
    email: str,
    secret: str | None,
  ) -> CalendarAccount:
    if account is None:
      assert secret is not None
      account = await accounts.create(
        CalendarAccount(user_id=user_id, provider=provider, email=email, encrypted_credentials=encrypt(secret)),
        flush=True,
      )
    else:
      if secret is not None:
        account.encrypted_credentials = encrypt(secret)
      account.sync_error = None
      await accounts.session.flush()
    self.request_sync(account.id)
    return account

  def request_sync(self, account_id: UUID) -> None:
    enqueue_job(SYNC_ACCOUNT_ACTOR, str(account_id))

  async def disconnect(self, accounts: CalendarAccountRepository, account: CalendarAccount) -> None:
    if account.provider == CalendarProvider.google:
      try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as http:
          await GoogleCalendarClient(http).revoke(decrypt(account.encrypted_credentials))
      except (httpx.HTTPError, InvalidToken):
        log.warning("calendar_token_revoke_failed", account_id=str(account.id))
    await accounts.delete(account, flush=True)

  async def fetch_snapshot(self, provider: CalendarProvider, email: str, encrypted_credentials: str) -> AccountSnapshot:
    """Network-only half of a sync: no database session is held while providers respond."""
    secret = decrypt(encrypted_credentials)
    start, end = sync_window()

    if provider == CalendarProvider.google:
      async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as http:
        google = _google_client(http)
        access_token = await google.refresh_access_token(secret)
        calendars = await google.list_calendars(access_token)
        events = {c.external_id: await google.list_events(access_token, c.external_id, start, end) for c in calendars}
      return AccountSnapshot(calendars, events)

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as http:
      icloud = ICloudCalendarClient(http, email, secret)
      calendars = await icloud.list_calendars()
      events = {c.external_id: await icloud.list_events(c.external_id, start, end) for c in calendars}
    return AccountSnapshot(calendars, events)

  async def apply_snapshot(
    self,
    calendars: CalendarRepository,
    events: CalendarEventRepository,
    account: CalendarAccount,
    snapshot: AccountSnapshot,
  ) -> None:
    by_external_id: dict[str, Calendar] = await calendars.sync_for_account(account, snapshot.calendars)
    for external_id, calendar in by_external_id.items():
      await events.replace_for_calendar(calendar, snapshot.events.get(external_id, []))
    account.last_synced_at = utc_now()
    account.sync_error = None


calendar_service = CalendarService()
