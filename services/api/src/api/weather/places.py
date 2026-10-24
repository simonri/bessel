"""Place names to coordinates, through OpenStreetMap's Nominatim: https://operations.osmfoundation.org/policies/nominatim/

Its policy allows at most one request a second for the whole app, asks for an identifying User-Agent, and
requires results to be cached; lookups are kept in Redis for a month.
"""

import asyncio
import json
from dataclasses import asdict, dataclass

import httpx

from api.exceptions import ServiceUnavailableError
from api.redis import Redis
from api.weather.yr import USER_AGENT

BASE_URL = "https://nominatim.openstreetmap.org"
TIMEOUT = httpx.Timeout(10.0)
KEEP_SECONDS = 30 * 24 * 3600
SLOT_KEY = "nominatim:slot"
SLOT_MS = 1100
SLOT_TRIES = 5


@dataclass(frozen=True)
class Place:
  name: str
  latitude: float
  longitude: float


# Tests swap in a fake network here and keep everything else real.
transport: httpx.AsyncBaseTransport | None = None


def http_client() -> httpx.AsyncClient:
  return httpx.AsyncClient(base_url=BASE_URL, timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}, transport=transport)


async def _wait_for_slot(redis: Redis) -> None:
  """Keeps the whole app, across workers, to one request a second."""
  for _ in range(SLOT_TRIES):
    if await redis.set(SLOT_KEY, "1", px=SLOT_MS, nx=True):
      return
    await asyncio.sleep(SLOT_MS / 1000)
  raise ServiceUnavailableError("Too many place lookups at once. Try again in a moment.")


def _name(found: dict) -> str:
  address = found.get("address") or {}
  town = found.get("name") or found.get("display_name", "").split(",")[0]
  region = address.get("state") or address.get("county")
  return ", ".join(part for part in (town, region, address.get("country")) if part)


async def find_place(redis: Redis, query: str) -> Place | None:
  """The best match for a place name, such as 'Åre' or 'Barcelona'; None when nothing matches."""
  key = f"nominatim:search:{query.strip().casefold()}"
  if (raw := await redis.get(key)) is not None:
    kept = json.loads(raw)
    return Place(**kept) if kept else None

  await _wait_for_slot(redis)
  params: dict[str, str | int] = {"q": query.strip(), "format": "jsonv2", "limit": 1, "addressdetails": 1, "accept-language": "sv,en"}
  try:
    async with http_client() as http:
      response = await http.get("/search", params=params)
    response.raise_for_status()
  except httpx.HTTPError as e:
    raise ServiceUnavailableError("The place lookup isn't answering right now. Try again, or give coordinates.") from e

  results = response.json()
  place = Place(name=_name(results[0]), latitude=float(results[0]["lat"]), longitude=float(results[0]["lon"])) if results else None
  await redis.set(key, json.dumps(asdict(place) if place else None), ex=KEEP_SECONDS)
  return place
