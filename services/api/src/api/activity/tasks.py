from datetime import timedelta

import structlog

from api.activity.repository import ActivityRepository
from api.common.utils import utc_now
from api.logging import Logger
from api.worker import AsyncSessionMaker, CronTrigger, TaskPriority, actor

log: Logger = structlog.get_logger()

# Titles name the mail, document or page on screen; after a month only the app and time are kept.
TITLES_KEPT_FOR = timedelta(days=30)


@actor(cron_trigger=CronTrigger(hour="4", minute="40"), priority=TaskPriority.LOW, max_retries=0)
async def forget_old_window_titles() -> None:
  async with AsyncSessionMaker() as session:
    cleared = await ActivityRepository.from_session(session).forget_titles_before(int((utc_now() - TITLES_KEPT_FOR).timestamp()))
  log.info("activity_titles_forgotten", count=cleared)
