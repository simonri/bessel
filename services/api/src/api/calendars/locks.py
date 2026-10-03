import asyncio
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID, uuid4

from api.redis import Redis

LOCK_TTL_SECONDS = 600
_POLL_SECONDS = 0.2
# Delete the key only if it still holds our token, so a lock that expired and
# was re-acquired by someone else is never released by us.
_RELEASE = """
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
"""


class AccountBusyError(Exception):
  """Another sync or edit holds the account's lock."""


def _key(account_id: UUID | str) -> str:
  return f"calendars:sync:{account_id}"


@asynccontextmanager
async def account_lock(redis: Redis, account_id: UUID | str, *, wait_seconds: float = 0) -> AsyncIterator[None]:
  """Serializes syncs and edits of one account.

  Without it a sync that fetched before an edit could write its stale snapshot
  after the edit's refresh, reverting the edit locally until the next sync.
  """
  key, token = _key(account_id), uuid4().hex
  deadline = time.monotonic() + wait_seconds
  while not await redis.set(key, token, nx=True, ex=LOCK_TTL_SECONDS):
    if time.monotonic() >= deadline:
      raise AccountBusyError(str(account_id))
    await asyncio.sleep(_POLL_SECONDS)
  try:
    yield
  finally:
    await redis.eval(_RELEASE, 1, key, token)  # type: ignore[misc]
