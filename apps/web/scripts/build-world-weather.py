# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Adds monthly humidity, rain and cloud cover, population and density to climate-data.json.

Weather is NASA POWER's monthly climatology (MERRA-2, 2001-2025) at each place, like the air
temperature. Population is Natural Earth's metro population. Density is the city proper's
population over its area, both from the same Wikidata item (linked from Natural Earth), so the
two always describe the same boundary. Places reuse weather an earlier run fetched.

  curl -L -o /tmp/places.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_populated_places.geojson
  uv run scripts/build-world-weather.py /tmp/places.geojson
"""

import calendar
import json
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

DATA = Path(__file__).parent.parent / "src/components/world-climate/climate-data.json"
WIKIDATA_URL = "https://query.wikidata.org/sparql"
USER_AGENT = "BesselWorldBuild/1.0 (https://github.com/simonri/bessel)"
POWER_URL = "https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=RH2M,PRECTOTCORR,CLOUD_AMT&community=RE&format=JSON"
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
# The densest city proper (Manila) has ~43,000 people per km2.
MIN_DENSITY, MAX_DENSITY = 10, 60_000
# Days per month in a non-leap year, to turn mm/day into a monthly total.
DAYS = [calendar.monthrange(2025, m)[1] for m in range(1, 13)]


def weather(lat: float, lon: float) -> dict:
  for attempt in range(4):
    try:
      with urllib.request.urlopen(f"{POWER_URL}&latitude={lat:.3f}&longitude={lon:.3f}", timeout=60) as res:
        p = json.load(res)["properties"]["parameter"]
      return {
        "humidity": [round(p["RH2M"][m]) for m in MONTHS],
        "rainMm": [round(p["PRECTOTCORR"][m] * DAYS[i]) for i, m in enumerate(MONTHS)],
        "cloud": [round(p["CLOUD_AMT"][m]) for m in MONTHS],
      }
    except (OSError, KeyError, ValueError):
      time.sleep(2 * (attempt + 1))
  raise RuntimeError(f"POWER kept failing at {lat},{lon}")


def city_sizes(ids: list[str]) -> dict[str, tuple[float, float]]:
  """The latest best-ranked population and the area (km2) per Wikidata item."""
  pops: dict[str, tuple[str, float]] = {}
  areas: dict[str, float] = {}
  for start in range(0, len(ids), 100):
    values = " ".join(f"wd:{i}" for i in ids[start : start + 100])
    query = f"""SELECT ?item ?pop ?date ?m2 WHERE {{
      VALUES ?item {{ {values} }}
      ?item p:P1082 ?statement . ?statement a wikibase:BestRank ; ps:P1082 ?pop .
      OPTIONAL {{ ?statement pq:P585 ?date }}
      ?item p:P2046 ?areaStatement . ?areaStatement a wikibase:BestRank ;
        psn:P2046/wikibase:quantityAmount ?m2 .
    }}"""
    request = urllib.request.Request(
      f"{WIKIDATA_URL}?{urllib.parse.urlencode({'query': query})}",
      headers={"Accept": "application/sparql-results+json", "User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(request, timeout=120) as res:
      for row in json.load(res)["results"]["bindings"]:
        item = row["item"]["value"].rsplit("/", 1)[-1]
        date = row.get("date", {}).get("value", "")
        if item not in pops or date > pops[item][0]:
          pops[item] = (date, float(row["pop"]["value"]))
        areas[item] = max(areas.get(item, 0.0), float(row["m2"]["value"]) / 1e6)
  return {item: (pop, areas[item]) for item, (_, pop) in pops.items() if areas.get(item, 0) > 0}


def main(places_path: str) -> None:
  data = json.loads(DATA.read_text())
  points = data["points"]

  todo = [p for p in points if "humidity" not in p]
  with ThreadPoolExecutor(max_workers=4) as pool:
    for point, result in zip(todo, pool.map(lambda p: weather(p["lat"], p["lon"]), todo), strict=True):
      point.update(result)

  places = [f["properties"] for f in json.loads(Path(places_path).read_text())["features"]]
  matches = {}

  for point in points:
    point.pop("population", None)
    point.pop("densityKm2", None)
    if not point["name"]:
      continue
    match = next(
      (pl for pl in places if pl["NAME"] == point["name"] and abs(pl["LATITUDE"] - point["lat"]) < 0.01 and abs(pl["LONGITUDE"] - point["lon"]) < 0.01),
      None,
    )
    if not match or not match.get("POP_MAX"):
      continue
    point["population"] = int(match["POP_MAX"])
    if match.get("WIKIDATAID"):
      matches[id(point)] = match["WIKIDATAID"]

  sizes = city_sizes(sorted(set(matches.values())))
  for point in points:
    size = sizes.get(matches.get(id(point), ""))
    density = size[0] / size[1] if size else None
    # Outside this range the population and area describe different boundaries
    # (a metro figure over a city's area), or the area is a vast municipality.
    if density and MIN_DENSITY <= density <= MAX_DENSITY:
      point["densityKm2"] = round(density)

  DATA.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")
  with_pop = sum(1 for p in points if "population" in p)
  with_density = sum(1 for p in points if "densityKm2" in p)
  print(f"weather for {len(points)} places, population for {with_pop}, density for {with_density}")


if __name__ == "__main__":
  main(sys.argv[1])
