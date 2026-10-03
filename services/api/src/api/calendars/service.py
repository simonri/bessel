import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

import httpx
import structlog

from api.calendars import http as provider_http
from api.calendars import push
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
SYNC_ACCOUNT_ACTOR = "sync_calendar_account"


class OAuthCallbackError(Exception):
  """Shown to the user on the callback page."""


@dataclass(frozen=True, slots=True)
class AccountSnapshot:
  calendars: list[ProviderCalendar]
  events: dict[str, list[ProviderEvent]]
  # Re-read on every sync so granting or revoking edit access in Google shows up.
  can_write: bool = True


def sync_window() -> tuple[datetime, datetime]:
  now = utc_now()
  return now - timedelta(days=SYNC_PAST_DAYS), now + timedelta(days=SYNC_FUTURE_DAYS)


def require_google_config() -> None:
  if not settings.GOOGLE_OAUTH_CLIENT_ID or not settings.GOOGLE_OAUTH_CLIENT_SECRET:
    raise ServiceUnavailableError("Google Calendar is not configured on this server")


def _google_client(http: httpx.AsyncClient) -> GoogleCalendarClient:
  require_google_config()
  return GoogleCalendarClient(http)


class CalendarService:
  def google_authorize_url(self, user_id: UUID) -> str:
    require_google_config()
    state = encrypt(json.dumps({"user_id": str(user_id)}))
    return authorize_url(state)

  async def complete_google_connect(self, accounts: CalendarAccountRepository, user_id: UUID, *, code: str, state: str) -> CalendarAccount:
    try:
      state_user_id = UUID(json.loads(decrypt(state, ttl=OAUTH_STATE_TTL_SECONDS))["user_id"])
    except (InvalidToken, ValueError, KeyError) as e:
      raise OAuthCallbackError("This sign-in link has expired. Start again from Bessel.") from e
    # Without this, anyone could send their own authorize link to someone else
    # and have that person's calendar land in their account.
    if state_user_id != user_id:
      raise OAuthCallbackError("This sign-in was started from a different Bessel account. Start again from Bessel.")

    async with provider_http.client() as http:
      google = _google_client(http)
      grant = await google.exchange_code(code)
      email = await google.get_email(grant.access_token)

    account = await accounts.get_by_identity(user_id, CalendarProvider.google, email)
    if grant.refresh_token is None and account is None:
      raise OAuthCallbackError("Google didn't grant offline access. Remove Bessel at myaccount.google.com/permissions and try again.")
    return await self._upsert_account(accounts, account, user_id, CalendarProvider.google, email, grant.refresh_token, can_write=grant.can_write)

  async def connect_icloud(self, accounts: CalendarAccountRepository, user_id: UUID, *, apple_id: str, app_password: str) -> CalendarAccount:
    try:
      async with provider_http.client() as http:
        await ICloudCalendarClient(http, apple_id, app_password).list_calendars()
    except ProviderAuthError as e:
      raise ValidationError("iCloud rejected that Apple ID or app-specific password", status_code=422) from e
    except httpx.HTTPError as e:
      raise ServiceUnavailableError("iCloud didn't respond, try again") from e

    account = await accounts.get_by_identity(user_id, CalendarProvider.icloud, apple_id)
    return await self._upsert_account(accounts, account, user_id, CalendarProvider.icloud, apple_id, app_password, can_write=True)

  async def _upsert_account(
    self,
    accounts: CalendarAccountRepository,
    account: CalendarAccount | None,
    user_id: UUID,
    provider: CalendarProvider,
    email: str,
    secret: str | None,
    *,
    can_write: bool,
  ) -> CalendarAccount:
    if account is None:
      assert secret is not None
      account = await accounts.create(
        CalendarAccount(user_id=user_id, provider=provider, email=email, encrypted_credentials=encrypt(secret), can_write=can_write),
        flush=True,
      )
    else:
      if secret is not None:
        account.encrypted_credentials = encrypt(secret)
      account.can_write = can_write
      account.sync_error = None
      await accounts.session.flush()
    self.request_sync(account.id)
    return account

  def request_sync(self, account_id: UUID) -> None:
    enqueue_job(SYNC_ACCOUNT_ACTOR, str(account_id))

  async def disconnect(self, accounts: CalendarAccountRepository, account: CalendarAccount) -> None:
    if account.provider == CalendarProvider.google:
      try:
        refresh_token = decrypt(account.encrypted_credentials)
        async with provider_http.client() as http:
          google = GoogleCalendarClient(http)
          # Stopping channels needs an access token, which revoking ends.
          await push.stop_google_channels(google, refresh_token, account.calendars)
          await google.revoke(refresh_token)
      except (httpx.HTTPError, InvalidToken):
        log.warning("calendar_token_revoke_failed", account_id=str(account.id))
    await accounts.delete(account, flush=True)

  async def fetch_snapshot(self, provider: CalendarProvider, email: str, encrypted_credentials: str) -> AccountSnapshot:
    """Network-only half of a sync: no database session is held while providers respond."""
    secret = decrypt(encrypted_credentials)
    start, end = sync_window()

    if provider == CalendarProvider.google:
      async with provider_http.client() as http:
        google = _google_client(http)
        grant = await google.refresh_access_token(secret)
        calendars = await google.list_calendars(grant.access_token)
        events = {c.external_id: await google.list_events(grant.access_token, c.external_id, start, end) for c in calendars}
      return AccountSnapshot(calendars, events, can_write=grant.can_write)

    async with provider_http.client() as http:
      icloud = ICloudCalendarClient(http, email, secret)
      calendars = await icloud.list_calendars()
      events = {c.external_id: await icloud.list_events(c.external_id, start, end) for c in calendars}
    return AccountSnapshot(calendars, events)

  async def fetch_calendar_events(self, provider: CalendarProvider, email: str, encrypted_credentials: str, calendar_external_id: str) -> list[ProviderEvent]:
    """One calendar's events in the sync window, for push-triggered syncs."""
    secret = decrypt(encrypted_credentials)
    start, end = sync_window()
    async with provider_http.client() as http:
      if provider == CalendarProvider.google:
        google = _google_client(http)
        grant = await google.refresh_access_token(secret)
        return await google.list_events(grant.access_token, calendar_external_id, start, end)
      return await ICloudCalendarClient(http, email, secret).list_events(calendar_external_id, start, end)

  async def fetch_icloud_calendars(self, email: str, encrypted_credentials: str) -> list[ProviderCalendar]:
    async with provider_http.client() as http:
      return await ICloudCalendarClient(http, email, decrypt(encrypted_credentials)).list_calendars()

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
    account.can_write = snapshot.can_write
    account.last_synced_at = utc_now()
    account.sync_error = None


calendar_service = CalendarService()
