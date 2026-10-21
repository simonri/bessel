from uuid import UUID

from api.avanza.repository import AvanzaConnectionRepository
from api.avanza.service import SYNC_ACTOR, avanza_service
from api.worker import AsyncSessionMaker, CronTrigger, TaskPriority, actor, enqueue_job


@actor(actor_name=SYNC_ACTOR, priority=TaskPriority.LOW, max_retries=0)
async def sync_avanza_connection(connection_id: str) -> None:
  await avanza_service.sync(AsyncSessionMaker, UUID(connection_id))


# After the Stockholm close (17:30), so the day's prices are final, and early morning.
@actor(cron_trigger=CronTrigger(hour="7,18", minute=30, timezone="Europe/Stockholm"), priority=TaskPriority.LOW, max_retries=0)
async def sync_all_avanza_connections() -> None:
  async with AsyncSessionMaker() as session:
    connection_ids = await AvanzaConnectionRepository.from_session(session).list_syncable_ids()
  for connection_id in connection_ids:
    enqueue_job(SYNC_ACTOR, str(connection_id))
