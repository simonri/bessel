from datetime import timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import structlog

from api.common.utils import utc_now
from api.goals.reflections import ask_if_due
from api.goals.repository import ReflectionRepository
from api.logging import Logger
from api.worker import AsyncSessionMaker, CronTrigger, TaskPriority, actor

log: Logger = structlog.get_logger()


@actor(cron_trigger=CronTrigger(minute="*/15"), priority=TaskPriority.LOW, max_retries=0)
async def ask_reflection_questions() -> None:
  """Every quarter hour, maybe asks each user who wants them one of their questions for the day."""
  async with AsyncSessionMaker() as session:
    reflections = ReflectionRepository.from_session(session)
    for plan, zone_name in await reflections.plans_asking():
      try:
        zone = ZoneInfo(zone_name)
      except ZoneInfoNotFoundError:
        continue
      recent = await reflections.list_for_user(plan.user_id, since=utc_now() - timedelta(days=14), limit=200)
      try:
        await ask_if_due(session, plan, zone, recent)
      except Exception:
        log.exception("goals.reflection_failed", user_id=str(plan.user_id))
