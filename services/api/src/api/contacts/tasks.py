from datetime import timedelta
from uuid import UUID

import structlog

from api.calendars.locks import AccountBusyError, account_lock
from api.common.utils import utc_now
from api.contacts.repository import ContactRepository, ContactSourceRepository
from api.contacts.service import SYNC_SOURCE_ACTOR, request_sync, sync_source
from api.logging import Logger
from api.worker import AsyncSessionMaker, CronTrigger, RedisMiddleware, TaskPriority, actor

log: Logger = structlog.get_logger()

PURGE_AFTER = timedelta(days=30)


@actor(actor_name=SYNC_SOURCE_ACTOR, priority=TaskPriority.LOW, max_retries=0)
async def sync_contact_source(source_id: str) -> None:
  # The cron and "Sync now" can overlap; the one already running covers both.
  try:
    async with account_lock(RedisMiddleware.get(), f"contacts:{source_id}"):
      await sync_source(AsyncSessionMaker, UUID(source_id))
  except AccountBusyError:
    log.info("contacts_sync_skipped_busy", source_id=source_id)


@actor(cron_trigger=CronTrigger(minute="*/15"), priority=TaskPriority.LOW, max_retries=0)
async def sync_all_contact_sources() -> None:
  async with AsyncSessionMaker() as session:
    sources = ContactSourceRepository.from_session(session)
    source_ids = [source.id for user_id in await sources.list_user_ids() for source in await sources.ensure_for_user(user_id)]
  for source_id in source_ids:
    request_sync(source_id)


@actor(cron_trigger=CronTrigger(hour="4", minute="20"), priority=TaskPriority.LOW, max_retries=0)
async def purge_deleted_contacts() -> None:
  """A contact deleted from the address book a month ago goes for good, with everything Bessel kept on them."""
  async with AsyncSessionMaker() as session:
    purged = await ContactRepository.from_session(session).purge_deleted(utc_now() - PURGE_AFTER)
  log.info("contacts_purged", count=purged)
