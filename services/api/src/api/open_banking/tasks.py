from uuid import UUID

import structlog

from api.common.utils import utc_now
from api.logging import Logger
from api.open_banking.repository import BankConnectionRepository
from api.open_banking.service import SYNC_ACTOR, open_banking_service
from api.worker import AsyncSessionMaker, CronTrigger, TaskPriority, actor, enqueue_job

log: Logger = structlog.get_logger()


@actor(actor_name=SYNC_ACTOR, priority=TaskPriority.LOW, max_retries=0)
async def sync_bank_connection(connection_id: str) -> None:
  await open_banking_service.sync(AsyncSessionMaker, UUID(connection_id))


# Twice a day: banks allow four unattended reads a day per account, and this
# leaves room for "Sync now".
@actor(cron_trigger=CronTrigger(hour="6,18", minute=0), priority=TaskPriority.LOW, max_retries=0)
async def sync_all_bank_connections() -> None:
  async with AsyncSessionMaker() as session:
    repository = BankConnectionRepository.from_session(session)
    connection_ids = await repository.list_ids()
    for connection_id in connection_ids:
      connection = await repository.get_by_id(connection_id)
      if connection is not None and await open_banking_service.warn_before_expiry(session, connection, now=utc_now()):
        log.info("enable_banking_expiry_warned", connection_id=str(connection_id))
  for connection_id in connection_ids:
    enqueue_job(SYNC_ACTOR, str(connection_id))
