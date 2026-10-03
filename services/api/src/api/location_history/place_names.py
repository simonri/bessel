"""Names for the Google place IDs in a timeline.

Google's terms allow storing place IDs but not the names and addresses
behind them, so names are looked up when a day is viewed and only held in
memory for a while.
"""

import asyncio
import time
from dataclasses import dataclass

import httpx
import structlog

from api.logging import Logger
from api.settings import settings

log: Logger = structlog.get_logger()

DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"
CACHE_TTL_SECS = 6 * 3600
CACHE_MAX_ENTRIES = 5000
MAX_CONCURRENT = 8


@dataclass(frozen=True, slots=True)
class PlaceName:
  name: str | None
  address: str | None


_cache: dict[str, tuple[float, PlaceName]] = {}


def can_look_up() -> bool:
  return bool(settings.GOOGLE_PLACES_API_KEY)


def clear_cache() -> None:
  _cache.clear()


def _cached(place_id: str, now: float) -> PlaceName | None:
  entry = _cache.get(place_id)
  if entry is None or now - entry[0] > CACHE_TTL_SECS:
    return None
  return entry[1]


def _remember(place_id: str, name: PlaceName, now: float) -> None:
  if len(_cache) >= CACHE_MAX_ENTRIES:
    for expired in [k for k, (at, _) in _cache.items() if now - at > CACHE_TTL_SECS] or list(_cache)[: CACHE_MAX_ENTRIES // 10]:
      del _cache[expired]
  _cache[place_id] = (now, name)


async def _fetch(client: httpx.AsyncClient, place_id: str) -> PlaceName | None:
  """None when the lookup failed and is worth retrying later."""
  try:
    response = await client.get(
      DETAILS_URL,
      params={"place_id": place_id, "fields": "name,formatted_address", "key": settings.GOOGLE_PLACES_API_KEY},
      timeout=10,
    )
    response.raise_for_status()
  except httpx.HTTPError as e:
    # The exception text includes the request URL, which carries the API key.
    log.warning("place_name_lookup_failed", error_type=type(e).__name__)
    return None
  data = response.json()
  status = data.get("status")
  if status == "OK":
    result = data.get("result", {})
    return PlaceName(name=result.get("name") or None, address=result.get("formatted_address") or None)
  if status in ("NOT_FOUND", "INVALID_REQUEST", "ZERO_RESULTS"):
    # Place IDs can expire; remember that so the day doesn't keep asking.
    return PlaceName(name=None, address=None)
  log.warning("place_name_lookup_failed", status=status)
  return None


async def look_up(place_ids: set[str]) -> dict[str, PlaceName]:
  """Names for whichever of the places could be looked up."""
  if not can_look_up() or not place_ids:
    return {}
  now = time.monotonic()
  found = {pid: name for pid in place_ids if (name := _cached(pid, now)) is not None}
  missing = sorted(place_ids - found.keys())
  if not missing:
    return found

  limit = asyncio.Semaphore(MAX_CONCURRENT)

  async def one(client: httpx.AsyncClient, place_id: str) -> tuple[str, PlaceName | None]:
    async with limit:
      return place_id, await _fetch(client, place_id)

  async with httpx.AsyncClient() as client:
    for place_id, name in await asyncio.gather(*(one(client, pid) for pid in missing)):
      if name is not None:
        _remember(place_id, name, now)
        found[place_id] = name
  return found
