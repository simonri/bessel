import structlog

from api.common.utils import utc_now
from api.logging import Logger
from api.sync_health.service import warn_stale
from api.worker import AsyncSessionMaker, CronTrigger, TaskPriority, actor

log: Logger = structlog.get_logger()


@actor(cron_trigger=CronTrigger(hour="*/6", minute=15, timezone="Europe/Stockholm"), priority=TaskPriority.LOW, max_retries=0)
async def warn_about_stale_syncs() -> None:
  async with AsyncSessionMaker() as session:
    warned = await warn_stale(session, now=utc_now())
  if warned:
    log.info("stale_syncs_warned", count=warned)
