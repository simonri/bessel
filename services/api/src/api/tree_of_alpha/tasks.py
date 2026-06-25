from datetime import UTC, datetime

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from api.common.utils import generate_uuid, utc_now
from api.models.notification import Notification
from api.models.tree_of_alpha_news import TreeOfAlphaNews
from api.worker import AsyncSessionMaker, CronTrigger, RedisMiddleware, TaskPriority, actor

log = structlog.get_logger()

_API_URL = "https://news.treeofalpha.com/api/news?limit=500"
_LIKES_THRESHOLD = 3
_COOLDOWN_KEY = "tree_of_alpha:scan_cooldown"
_COOLDOWN_SECONDS = 50


def _truncate(text: str, max_len: int) -> str:
  if len(text) <= max_len:
    return text
  return text[: max_len - 1] + "…"


@actor(cron_trigger=CronTrigger(minute="*"), priority=TaskPriority.LOW)
async def scan_tree_of_alpha() -> None:
  redis = RedisMiddleware.get()
  acquired = await redis.set(_COOLDOWN_KEY, "1", nx=True, ex=_COOLDOWN_SECONDS)
  if not acquired:
    return

  async with httpx.AsyncClient(timeout=30) as http:
    response = await http.get(_API_URL)
    response.raise_for_status()
    news_items: list[dict] = response.json()

  if not news_items:
    return

  now = utc_now()
  rows = [
    {
      "id": generate_uuid(),
      "created_at": now,
      "external_id": item["_id"],
      "title": item.get("title") or "",
      "url": item.get("url"),
      "source": item.get("source"),
      "likes": item.get("likes", 0),
      "published_at": datetime.fromtimestamp(item["time"] / 1000, tz=UTC),
    }
    for item in news_items
  ]

  async with AsyncSessionMaker() as session:
    stmt = pg_insert(TreeOfAlphaNews).values(rows)
    stmt = stmt.on_conflict_do_update(
      index_elements=["external_id"],
      set_={"likes": stmt.excluded.likes},
    )
    await session.execute(stmt)

    result = await session.execute(
      select(TreeOfAlphaNews)
      .where(TreeOfAlphaNews.likes >= _LIKES_THRESHOLD)
      .where(TreeOfAlphaNews.notification_sent_at.is_(None))
      .where(TreeOfAlphaNews.deleted_at.is_(None))
    )
    items_to_notify = result.scalars().all()

    for item in items_to_notify:
      session.add(
        Notification(
          title=_truncate(item.title, 255),
          body=item.url,
          kind="info",
        )
      )
      item.notification_sent_at = now

  log.info("tree_of_alpha_scan", fetched=len(rows), notified=len(items_to_notify))
