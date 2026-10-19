# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx>=0.27"]
# ///
"""Adds OpenStreetMap (ODbL) counts around each city to src/components/world-climate/climate-data.json.

Via the Overpass API:
- scene: cafés (amenity=cafe) and coworking spaces (amenity=coworking_space or office=coworking) within 5 km.
- beaches: beaches (natural=beach) within 15 km.

Answers are cached per place and count in CACHE, so a rerun only asks for what's new.

  uv run scripts/build-world-osm.py /tmp/overpass-cache.json
"""

import json
import sys
import time
from pathlib import Path

import httpx

DATA = Path(__file__).parent.parent / "src/components/world-climate/climate-data.json"
OVERPASS = "https://overpass-api.de/api/interpreter"
PAUSE_S = 5
BATCH = 15
HEADERS = {"User-Agent": "bessel-world-page/1.0 (personal dashboard)"}
# Overpass filters per count, and the radius in metres to count within.
COUNTS = {
  "cafes": (["nwr[amenity=cafe]"], 5000),
  "coworking": (["nwr[amenity=coworking_space]", "nwr[office=coworking]"], 5000),
  "beaches": (["nwr[natural=beach]"], 15000),
}


def query(client: httpx.Client, count: str, places: list[tuple[float, float]]) -> list[int]:
  """How many of `count` there are around each place, asked in one query."""
  filters, radius = COUNTS[count]
  statements = ["(" + "".join(f"{f}(around:{radius},{lat},{lon});" for f in filters) + ");out count;" for lat, lon in places]
  body = "[out:json][timeout:600];" + "".join(statements)
  for attempt in range(6):
    try:
      response = client.post(OVERPASS, data={"data": body}, timeout=660)
    except httpx.TransportError:
      time.sleep(30 * (attempt + 1))
      continue
    if response.status_code in (429, 502, 503, 504):
      time.sleep(30 * (attempt + 1))
      continue
    response.raise_for_status()
    return [int(e["tags"]["total"]) for e in response.json()["elements"]]
  raise RuntimeError("Overpass kept failing")


def place_key(point: dict) -> str:
  return f"{point['lat']},{point['lon']}"


def main(cache_path: str) -> None:
  cache_file = Path(cache_path)
  cache: dict[str, dict[str, int]] = json.loads(cache_file.read_text()) if cache_file.exists() else {}
  data = json.loads(DATA.read_text())
  named = [p for p in data["points"] if p["name"]]
  with httpx.Client(headers=HEADERS) as client:
    for count in COUNTS:
      missing = [p for p in named if count not in cache.get(place_key(p), {})]
      for start in range(0, len(missing), BATCH):
        batch = missing[start : start + BATCH]
        totals = query(client, count, [(p["lat"], p["lon"]) for p in batch])
        for point, total in zip(batch, totals, strict=True):
          cache.setdefault(place_key(point), {})[count] = total
        cache_file.write_text(json.dumps(cache))
        print(f"{count}: {start + len(batch)} of {len(missing)}", flush=True)
        time.sleep(PAUSE_S)

  for point in data["points"]:
    counts = cache.get(place_key(point)) if point["name"] else None
    point["scene"] = {"cafes": counts["cafes"], "coworking": counts["coworking"]} if counts else None
    point["beaches"] = counts["beaches"] if counts else None
  DATA.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")
  print(f"Counts for {len(named)} places")


if __name__ == "__main__":
  main(sys.argv[1])
