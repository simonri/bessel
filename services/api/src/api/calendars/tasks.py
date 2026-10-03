from uuid import UUID

import httpx
import structlog

from api.calendars import push
from api.calendars.locks import AccountBusyError, account_lock
from api.calendars.people import refresh_people
from api.calendars.providers import ProviderAuthError, ProviderError
from api.calendars.repository import CalendarAccountRepository, CalendarEventRepository, CalendarRepository
from api.calendars.service import SYNC_ACCOUNT_ACTOR, calendar_service
from api.logging import Logger
from api.models.calendar_account import CalendarProvider
from api.worker import AsyncSessionMaker, CronTrigger, RedisMiddleware, TaskPriority, actor, enqueue_job

log: Logger = structlog.get_logger()

CHECK_ICLOUD_ACTOR = "check_icloud_calendar_account"


@actor(actor_name=SYNC_ACCOUNT_ACTOR, priority=TaskPriority.LOW, max_retries=0)
async def sync_calendar_account(account_id: str) -> None:
  # Cron, "Sync now", the post-connect sync and edits can all target one
  # account; an edit refreshes what it changed, so a busy account is skipped.
  redis = RedisMiddleware.get()
  try:
    async with account_lock(redis, account_id):
      user_id = await _sync(UUID(account_id))
  except AccountBusyError:
    log.info("calendar_sync_skipped_busy", account_id=account_id)
    return
  if user_id is None:
    return
  await push.publish_change(redis, user_id)
  try:
    await push.renew_google_channels(AsyncSessionMaker, UUID(account_id))
  except (ProviderError, httpx.HTTPError):
    log.warning("calendar_channel_renewal_failed", account_id=account_id, exc_info=True)
  # Names and photos are a nicety: failing to fetch them never fails a sync.
  try:
    if await refresh_people(AsyncSessionMaker, UUID(account_id)):
      await push.publish_change(redis, user_id)
  except (ProviderError, httpx.HTTPError):
    log.warning("calendar_people_refresh_failed", account_id=account_id, exc_info=True)


async def _sync(account_id: UUID) -> UUID | None:
  """Mirrors the account; returns its user once the result is committed."""
  async with AsyncSessionMaker() as session:
    account = await CalendarAccountRepository.from_session(session).get_by_id(account_id)
    if account is None:
      return None
    provider, email, credentials = account.provider, account.email, account.encrypted_credentials

  # Failures are recorded on the account rather than retried; the next cron
  # run tries again, and a revoked grant needs the user, not a retry.
  try:
    snapshot = await calendar_service.fetch_snapshot(provider, email, credentials)
  except ProviderAuthError as e:
    await _record_error(account_id, f"{e}. Reconnect the account.")
    return None
  except Exception:
    log.exception("calendar_sync_failed", account_id=str(account_id))
    await _record_error(account_id, "Sync failed, retrying shortly.")
    return None

  async with AsyncSessionMaker() as session:
    account = await CalendarAccountRepository.from_session(session).get_by_id(account_id)
    if account is None:
      return None
    await calendar_service.apply_snapshot(
      CalendarRepository.from_session(session),
      CalendarEventRepository.from_session(session),
      account,
      snapshot,
    )
    user_id = account.user_id
  log.info("calendar_synced", account_id=str(account_id), calendars=len(snapshot.calendars))
  return user_id


async def _record_error(account_id: UUID, message: str) -> None:
  async with AsyncSessionMaker() as session:
    account = await CalendarAccountRepository.from_session(session).get_by_id(account_id)
    if account is not None:
      account.sync_error = message


@actor(actor_name=push.PUSH_SYNC_ACTOR, priority=TaskPriority.HIGH, max_retries=0)
async def sync_calendar_from_push(calendar_id: str, attempt: int = 0) -> None:
  """Re-syncs one calendar after its provider said it changed.

  Unlike the cron sync this never just gives up on a busy account: the busy
  sync may have fetched before the change, so it would be lost until the cron.
  """
  redis = RedisMiddleware.get()
  async with AsyncSessionMaker() as session:
    found = await CalendarRepository.from_session(session).get_with_account(UUID(calendar_id))
    if found is None:
      await push.clear_pending_push_sync(redis, calendar_id)
      return
    calendar, account = found
    account_id, user_id = account.id, account.user_id
    provider, email, credentials, external_id = account.provider, account.email, account.encrypted_credentials, calendar.external_id

  try:
    async with account_lock(redis, account_id):
      # Cleared before fetching: a notification from here on may describe a
      # change this fetch misses, so it has to be able to schedule another run.
      await push.clear_pending_push_sync(redis, calendar_id)
      try:
        events = await calendar_service.fetch_calendar_events(provider, email, credentials, external_id)
      except (ProviderError, httpx.HTTPError):
        # The cron sync records the error on the account and retries.
        log.warning("calendar_push_sync_failed", calendar_id=calendar_id, exc_info=True)
        return
      async with AsyncSessionMaker() as session:
        calendar = await CalendarRepository.from_session(session).get_by_id(UUID(calendar_id))
        if calendar is None:
          return
        await CalendarEventRepository.from_session(session).replace_for_calendar(calendar, events)
  except AccountBusyError:
    if attempt < push.MAX_BUSY_RETRIES:
      enqueue_job(push.PUSH_SYNC_ACTOR, calendar_id, attempt + 1, delay=push.BUSY_RETRY_DELAY_MS)
    else:
      log.warning("calendar_push_sync_gave_up", calendar_id=calendar_id)
      await push.clear_pending_push_sync(redis, calendar_id)
    return
  await push.publish_change(redis, user_id)


@actor(actor_name=CHECK_ICLOUD_ACTOR, priority=TaskPriority.MEDIUM, max_retries=0)
async def check_icloud_calendar_account(account_id: str) -> None:
  """Syncs the account when any calendar's ctag differs from the last sync's,
  or calendars were added or removed. One PROPFIND when nothing changed."""
  async with AsyncSessionMaker() as session:
    account = await CalendarAccountRepository.from_session(session).get_by_id(UUID(account_id))
    if account is None or account.provider != CalendarProvider.icloud:
      return
    known = {c.external_id: c.change_tag for c in await CalendarRepository.from_session(session).list_for_account(account)}
    email, credentials = account.email, account.encrypted_credentials

  try:
    calendars = await calendar_service.fetch_icloud_calendars(email, credentials)
  except (ProviderError, httpx.HTTPError):
    # The cron sync surfaces the error on the account.
    log.info("icloud_change_check_failed", account_id=account_id)
    return
  if {c.external_id: c.change_tag for c in calendars} != known:
    calendar_service.request_sync(UUID(account_id))


@actor(cron_trigger=CronTrigger(minute="*"), priority=TaskPriority.MEDIUM, max_retries=0)
async def check_icloud_calendar_accounts() -> None:
  async with AsyncSessionMaker() as session:
    account_ids = await CalendarAccountRepository.from_session(session).list_ids(CalendarProvider.icloud)
  for account_id in account_ids:
    enqueue_job(CHECK_ICLOUD_ACTOR, str(account_id))


@actor(cron_trigger=CronTrigger(minute="*/15"), priority=TaskPriority.LOW, max_retries=0)
async def sync_all_calendar_accounts() -> None:
  async with AsyncSessionMaker() as session:
    account_ids = await CalendarAccountRepository.from_session(session).list_ids()
  for account_id in account_ids:
    enqueue_job(SYNC_ACCOUNT_ACTOR, str(account_id))
