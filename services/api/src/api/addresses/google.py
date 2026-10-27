"""Address suggestions and their parts through Google's Places Autocomplete and Details.

Both calls carry the same session token: Google bills the typing and the pick
as one session, so suggestions per keystroke cost nothing extra.
"""

from dataclasses import dataclass
from typing import Any

import httpx

BASE_URL = "https://maps.googleapis.com/maps/api/place"
TIMEOUT = 10
# Swedish addresses read best as Sweden writes them; Google translates place names, not street names.
LANGUAGE = "sv"
transport: httpx.AsyncBaseTransport | None = None


class AddressLookupError(Exception):
  """Google couldn't be reached or refused the request; the key is never in the message."""


@dataclass(frozen=True, slots=True)
class Suggestion:
  place_id: str
  main_text: str
  secondary_text: str | None


@dataclass(frozen=True, slots=True)
class AddressParts:
  formatted: str
  street_address: str | None
  postal_code: str | None
  city: str | None
  region: str | None
  country: str | None
  country_code: str | None
  latitude: float | None
  longitude: float | None


def _client() -> httpx.AsyncClient:
  return httpx.AsyncClient(base_url=BASE_URL, timeout=TIMEOUT, transport=transport)


async def _get(path: str, params: dict[str, str], key: str) -> dict[str, Any]:
  async with _client() as http:
    try:
      response = await http.get(path, params={**params, "language": LANGUAGE, "key": key})
      response.raise_for_status()
      data = response.json()
    except (httpx.HTTPError, ValueError) as e:
      raise AddressLookupError(type(e).__name__) from e
  status = data.get("status")
  if status not in ("OK", "ZERO_RESULTS"):
    raise AddressLookupError(str(status))
  return data


async def suggest(text: str, session: str, key: str) -> list[Suggestion]:
  data = await _get("/autocomplete/json", {"input": text, "types": "address", "sessiontoken": session}, key)
  suggestions = []
  for prediction in data.get("predictions", []):
    formatting = prediction.get("structured_formatting") or {}
    main = formatting.get("main_text") or prediction.get("description")
    if prediction.get("place_id") and main:
      suggestions.append(Suggestion(prediction["place_id"], main, formatting.get("secondary_text") or None))
  return suggestions


async def details(place_id: str, session: str, key: str) -> AddressParts | None:
  data = await _get(
    "/details/json",
    {"place_id": place_id, "fields": "address_component,formatted_address,geometry", "sessiontoken": session},
    key,
  )
  result = data.get("result")
  return parts_of(result) if result else None


def parts_of(result: dict[str, Any]) -> AddressParts:
  """A Place Details result as address-book parts. Sweden names the city as the postal town, not the locality."""
  long_name: dict[str, str] = {}
  short_name: dict[str, str] = {}
  for component in result.get("address_components", []):
    for kind in component.get("types", []):
      long_name.setdefault(kind, component.get("long_name", ""))
      short_name.setdefault(kind, component.get("short_name", ""))
  street = " ".join(p for p in (long_name.get("route"), long_name.get("street_number")) if p) or None
  location = (result.get("geometry") or {}).get("location") or {}
  return AddressParts(
    formatted=result.get("formatted_address", ""),
    street_address=street,
    postal_code=long_name.get("postal_code") or None,
    city=long_name.get("postal_town") or long_name.get("locality") or long_name.get("sublocality") or None,
    region=long_name.get("administrative_area_level_1") or None,
    country=long_name.get("country") or None,
    country_code=short_name.get("country") or None,
    latitude=location.get("lat"),
    longitude=location.get("lng"),
  )
