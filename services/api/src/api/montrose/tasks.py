from uuid import UUID

from api.montrose.repository import MontroseConnectionRepository
from api.montrose.service import SYNC_ACTOR, montrose_service
from api.worker import AsyncSessionMaker, CronTrigger, TaskPriority, actor, enqueue_job


@actor(actor_name=SYNC_ACTOR, priority=TaskPriority.LOW, max_retries=0)
async def sync_montrose_connection(connection_id: str) -> None:
  await montrose_service.sync(AsyncSessionMaker, UUID(connection_id))


# Twice a day like Avanza; each run also refreshes the tokens, which keeps the 14-day refresh token alive.
@actor(cron_trigger=CronTrigger(hour="7,18", minute=40, timezone="Europe/Stockholm"), priority=TaskPriority.LOW, max_retries=0)
async def sync_all_montrose_connections() -> None:
  async with AsyncSessionMaker() as session:
    connection_ids = await MontroseConnectionRepository.from_session(session).list_syncable_ids()
  for connection_id in connection_ids:
    enqueue_job(SYNC_ACTOR, str(connection_id))
