from uuid import UUID

import structlog

from api.calendars.locks import AccountBusyError, account_lock
from api.contacts.repository import ContactSourceRepository
from api.contacts.service import SYNC_SOURCE_ACTOR, request_sync, sync_source
from api.logging import Logger
from api.worker import AsyncSessionMaker, CronTrigger, RedisMiddleware, TaskPriority, actor

log: Logger = structlog.get_logger()


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
