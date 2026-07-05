from datetime import UTC, datetime
from typing import Any

import httpx
import structlog

from api.common.utils import generate_uuid, utc_now
from api.models.notification import Notification
from api.tree_of_alpha.repository import TreeOfAlphaNewsRepository
from api.users.repository import UserRepository
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


def _to_row(item: dict[str, Any], created_at: datetime) -> dict[str, Any] | None:
  external_id = item.get("_id")
  published_ms = item.get("time")
  if not external_id or not isinstance(published_ms, (int, float)):
    return None
  return {
    "id": generate_uuid(),
    "created_at": created_at,
    "external_id": external_id,
    "title": item.get("title") or "",
    "url": item.get("url"),
    "source": item.get("source"),
    "likes": item.get("likes", 0),
    "published_at": datetime.fromtimestamp(published_ms / 1000, tz=UTC),
  }


@actor(cron_trigger=CronTrigger(minute="*"), priority=TaskPriority.LOW)
async def scan_tree_of_alpha() -> None:
  redis = RedisMiddleware.get()
  acquired = await redis.set(_COOLDOWN_KEY, "1", nx=True, ex=_COOLDOWN_SECONDS)
  if not acquired:
    return

  try:
    await _scan()
  except Exception:
    # Release the cooldown, otherwise Dramatiq's retries (2s backoff) land
    # inside the window and silently no-op instead of retrying the scan.
    await redis.delete(_COOLDOWN_KEY)
    raise


async def _scan() -> None:
  async with httpx.AsyncClient(timeout=30) as http:
    response = await http.get(_API_URL)
    response.raise_for_status()
    news_items: list[dict] = response.json()

  now = utc_now()
  # Keyed by external_id: a malformed item must not break the batch, and
  # duplicate ids would make ON CONFLICT DO UPDATE fail ("cannot affect row a second time").
  rows_by_id: dict[str, dict[str, Any]] = {}
  malformed = 0
  for item in news_items:
    row = _to_row(item, now)
    if row is None:
      malformed += 1
      continue
    rows_by_id[row["external_id"]] = row

  if malformed:
    log.warning("tree_of_alpha_malformed_items", count=malformed)
  if not rows_by_id:
    return

  notified = 0
  async with AsyncSessionMaker() as session:
    news_repo = TreeOfAlphaNewsRepository.from_session(session)
    await news_repo.upsert_all(list(rows_by_id.values()))

    items_to_notify = await news_repo.list_pending_notification(min_likes=_LIKES_THRESHOLD)
    user_ids = await UserRepository.from_session(session).list_ids()

    # With no users yet, leave notification_sent_at unset so the items are
    # picked up once a user exists instead of being silently consumed.
    if items_to_notify and user_ids:
      for item in items_to_notify:
        for user_id in user_ids:
          session.add(
            Notification(
              title=_truncate(item.title, 255),
              link=item.url,
              kind="info",
              user_id=user_id,
            )
          )
        item.notification_sent_at = now
      notified = len(items_to_notify)

  log.info("tree_of_alpha_scan", fetched=len(rows_by_id), notified=notified)
