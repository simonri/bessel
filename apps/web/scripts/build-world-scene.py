# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx>=0.27"]
# ///
"""Adds how many cafés and coworking spaces each city has to src/components/world-climate/climate-data.json.

Counts OpenStreetMap (ODbL) features within RADIUS_M of the city via the Overpass API: amenity=cafe for cafés,
and amenity=coworking_space or office=coworking for coworking. Answers are cached in CACHE, so a rerun only
asks about new places.

  uv run scripts/build-world-scene.py /tmp/overpass-cache.json
"""

import json
import sys
import time
from pathlib import Path

import httpx

DATA = Path(__file__).parent.parent / "src/components/world-climate/climate-data.json"
OVERPASS = "https://overpass-api.de/api/interpreter"
RADIUS_M = 5000
PAUSE_S = 5
BATCH = 15
HEADERS = {"User-Agent": "bessel-world-page/1.0 (personal dashboard)"}


def counts(client: httpx.Client, places: list[tuple[float, float]]) -> list[dict[str, int]]:
  """Cafés and coworking spaces around each place, asked in one query."""
  statements = []
  for lat, lon in places:
    around = f"(around:{RADIUS_M},{lat},{lon})"
    statements.append(f"nwr[amenity=cafe]{around};out count;")
    statements.append(f"(nwr[amenity=coworking_space]{around};nwr[office=coworking]{around};);out count;")
  query = "[out:json][timeout:600];" + "".join(statements)
  for attempt in range(6):
    response = client.post(OVERPASS, data={"data": query}, timeout=660)
    if response.status_code in (429, 502, 503, 504):
      time.sleep(30 * (attempt + 1))
      continue
    response.raise_for_status()
    totals = [int(e["tags"]["total"]) for e in response.json()["elements"]]
    return [{"cafes": totals[i], "coworking": totals[i + 1]} for i in range(0, len(totals), 2)]
  raise RuntimeError("Overpass kept failing")


def place_key(point: dict) -> str:
  return f"{point['lat']},{point['lon']}"


def main(cache_path: str) -> None:
  cache_file = Path(cache_path)
  cache = json.loads(cache_file.read_text()) if cache_file.exists() else {}
  data = json.loads(DATA.read_text())
  missing = [p for p in data["points"] if p["name"] and place_key(p) not in cache]
  with httpx.Client(headers=HEADERS) as client:
    for start in range(0, len(missing), BATCH):
      batch = missing[start : start + BATCH]
      for point, result in zip(batch, counts(client, [(p["lat"], p["lon"]) for p in batch]), strict=True):
        cache[place_key(point)] = result
      cache_file.write_text(json.dumps(cache))
      print(f"{start + len(batch)} of {len(missing)}", flush=True)
      time.sleep(PAUSE_S)

  for point in data["points"]:
    point["scene"] = cache.get(place_key(point)) if point["name"] else None
  DATA.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")
  print(f"Scene for {sum(1 for p in data['points'] if p['scene'])} places")


if __name__ == "__main__":
  main(sys.argv[1])
