from uuid import UUID

import structlog

from api.calendars.providers import ProviderAuthError
from api.calendars.repository import CalendarAccountRepository, CalendarEventRepository, CalendarRepository
from api.calendars.service import SYNC_ACCOUNT_ACTOR, calendar_service
from api.logging import Logger
from api.worker import AsyncSessionMaker, CronTrigger, RedisMiddleware, TaskPriority, actor, enqueue_job

log: Logger = structlog.get_logger()

_LOCK_SECONDS = 600


@actor(actor_name=SYNC_ACCOUNT_ACTOR, priority=TaskPriority.LOW, max_retries=0)
async def sync_calendar_account(account_id: str) -> None:
  # Cron, "Sync now" and the post-connect sync can all target one account.
  redis = RedisMiddleware.get()
  lock_key = f"calendars:sync:{account_id}"
  if not await redis.set(lock_key, "1", nx=True, ex=_LOCK_SECONDS):
    return
  try:
    await _sync(UUID(account_id))
  finally:
    await redis.delete(lock_key)


async def _sync(account_id: UUID) -> None:
  async with AsyncSessionMaker() as session:
    account = await CalendarAccountRepository.from_session(session).get_by_id(account_id)
    if account is None:
      return
    provider, email, credentials = account.provider, account.email, account.encrypted_credentials

  # Failures are recorded on the account rather than retried; the next cron
  # run tries again, and a revoked grant needs the user, not a retry.
  try:
    snapshot = await calendar_service.fetch_snapshot(provider, email, credentials)
  except ProviderAuthError as e:
    await _record_error(account_id, f"{e}. Reconnect the account.")
    return
  except Exception:
    log.exception("calendar_sync_failed", account_id=str(account_id))
    await _record_error(account_id, "Sync failed, retrying shortly.")
    return

  async with AsyncSessionMaker() as session:
    account = await CalendarAccountRepository.from_session(session).get_by_id(account_id)
    if account is None:
      return
    await calendar_service.apply_snapshot(
      CalendarRepository.from_session(session),
      CalendarEventRepository.from_session(session),
      account,
      snapshot,
    )
  log.info("calendar_synced", account_id=str(account_id), calendars=len(snapshot.calendars))


async def _record_error(account_id: UUID, message: str) -> None:
  async with AsyncSessionMaker() as session:
    account = await CalendarAccountRepository.from_session(session).get_by_id(account_id)
    if account is not None:
      account.sync_error = message


@actor(cron_trigger=CronTrigger(minute="*/15"), priority=TaskPriority.LOW, max_retries=0)
async def sync_all_calendar_accounts() -> None:
  async with AsyncSessionMaker() as session:
    account_ids = await CalendarAccountRepository.from_session(session).list_ids()
  for account_id in account_ids:
    enqueue_job(SYNC_ACCOUNT_ACTOR, str(account_id))
