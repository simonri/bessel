"""Gives this test run a slot of its own, so test runs in other checkouts (git worktrees) can't touch its databases.

Each slot has its own Postgres databases and its own block of 16 Redis databases. The slot is held with a file
lock for the whole run and handed to the xdist workers through the environment. Redis normally has 16 databases,
which makes one slot: test runs then take turns. Start Redis with more (the compose file asks
for 128) and up to 8 run side by side.
"""

import fcntl
import os
import sys
import time
from pathlib import Path
from typing import IO

SLOT_ENV = "BESSEL_TEST_SLOT"
REDIS_DATABASES_PER_SLOT = 16
MAX_SLOTS = 8
LOCK_DIR = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "bessel" / "test-slots"

_held: IO[str] | None = None


def _redis_databases() -> int:
  try:
    import redis

    client = redis.Redis(
      host=os.environ.get("BESSEL_REDIS_HOST", "127.0.0.1"),
      port=int(os.environ.get("BESSEL_REDIS_PORT", "6379")),
      socket_connect_timeout=1,
    )
    return int(client.config_get("databases")["databases"])
  except Exception:
    return REDIS_DATABASES_PER_SLOT


def _take_slot() -> int:
  global _held
  slots = max(1, min(MAX_SLOTS, _redis_databases() // REDIS_DATABASES_PER_SLOT))
  LOCK_DIR.mkdir(parents=True, exist_ok=True)
  waiting = False
  while True:
    for slot in range(slots):
      handle = (LOCK_DIR / f"{slot}.lock").open("w")
      try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
      except BlockingIOError:
        handle.close()
        continue
      handle.write(f"{os.getpid()} {Path.cwd()}\n")
      handle.flush()
      _held = handle
      return slot
    if not waiting:
      print(f"Waiting for a test slot: other test runs hold all {slots}.", file=sys.stderr)
      waiting = True
    time.sleep(1)


# xdist workers inherit the slot their controller took.
if "PYTEST_XDIST_WORKER" not in os.environ and SLOT_ENV not in os.environ:
  os.environ[SLOT_ENV] = str(_take_slot())
