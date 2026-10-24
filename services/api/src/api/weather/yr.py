"""MET Norway's Locationforecast, the forecast behind Yr: https://api.met.no/weatherapi/locationforecast/2.0/documentation

Its terms ask every app to name itself in the User-Agent, to send at most 4 decimals of a coordinate, and to
not ask again before the `Expires` time; after that a request carries `If-Modified-Since`, and a 304 means the
copy kept here is still current. Forecasts are kept in Redis for that.
"""

import json
from datetime import UTC, datetime
from email.utils import format_datetime, parsedate_to_datetime
from typing import Any

import httpx

from api.common.utils import utc_now
from api.exceptions import ServiceUnavailableError
from api.redis import Redis

BASE_URL = "https://api.met.no/weatherapi/locationforecast/2.0"
USER_AGENT = "Bessel/1.0 (+https://getbessel.com)"
TIMEOUT = httpx.Timeout(10.0)
# About a kilometre: close enough for a forecast, and nearby questions share one copy.
DECIMALS = 2
# Kept past `Expires` so the next request can be a cheap If-Modified-Since.
KEEP_SECONDS = 24 * 3600
UNAVAILABLE = "Yr's forecast service isn't answering right now. Try again in a little while."


# Tests swap in a fake network here and keep everything else real.
transport: httpx.AsyncBaseTransport | None = None


def http_client() -> httpx.AsyncClient:
  return httpx.AsyncClient(base_url=BASE_URL, timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}, transport=transport)


def _key(latitude: float, longitude: float) -> str:
  return f"yr:forecast:{latitude:.{DECIMALS}f}:{longitude:.{DECIMALS}f}"


def _expires(response: httpx.Response) -> datetime:
  header = response.headers.get("Expires")
  try:
    return parsedate_to_datetime(header).astimezone(UTC) if header else utc_now()
  except (TypeError, ValueError):
    return utc_now()


async def locationforecast(redis: Redis, latitude: float, longitude: float) -> dict[str, Any]:
  """Yr's complete forecast for the point, from the copy kept here while it's current."""
  key = _key(latitude, longitude)
  raw = await redis.get(key)
  kept = json.loads(raw) if raw else None
  if kept is not None and datetime.fromisoformat(kept["expires"]) > utc_now():
    return kept["forecast"]

  headers = {"If-Modified-Since": kept["last_modified"]} if kept and kept.get("last_modified") else {}
  params = {"lat": f"{latitude:.{DECIMALS}f}", "lon": f"{longitude:.{DECIMALS}f}"}
  try:
    async with http_client() as http:
      response = await http.get("/complete", params=params, headers=headers)
  except httpx.HTTPError as e:
    raise ServiceUnavailableError(UNAVAILABLE) from e

  if response.status_code == 304 and kept is not None:
    forecast = kept["forecast"]
  elif response.status_code == 200:
    forecast = response.json()
  else:
    raise ServiceUnavailableError(UNAVAILABLE)
  last_modified = response.headers.get("Last-Modified") or (kept or {}).get("last_modified") or format_datetime(utc_now(), usegmt=True)
  await redis.set(key, json.dumps({"forecast": forecast, "expires": _expires(response).isoformat(), "last_modified": last_modified}), ex=KEEP_SECONDS)
  return forecast
