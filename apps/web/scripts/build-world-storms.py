# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy>=2.0"]
# ///
"""Adds each city's tropical storm risk per month to src/components/world-climate/climate-data.json.

From NOAA's IBTrACS v04r01 best tracks: for each month, the share of years (FIRST_YEAR to LAST_YEAR) in which a
tropical storm or stronger (34 kt+) passed within RADIUS_KM of the city. Distances are to the track between fixes,
since fixes are hours and often 100+ km apart.

  curl -L -o /tmp/ibtracs.csv "https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/ibtracs.since1980.list.v04r01.csv"
  uv run scripts/build-world-storms.py /tmp/ibtracs.csv
"""

import csv
import json
import sys
from pathlib import Path

import numpy as np

DATA = Path(__file__).parent.parent / "src/components/world-climate/climate-data.json"
FIRST_YEAR, LAST_YEAR = 1991, 2025
RADIUS_KM = 150
STORM_KT = 34
KM_PER_DEGREE = 111.32


def wind(row: dict[str, str]) -> float | None:
  for column in ("USA_WIND", "WMO_WIND"):
    value = row[column].strip()
    if value:
      return float(value)
  return None


def storm_segments(ibtracs_path: str) -> np.ndarray:
  """Rows of (lat1, lon1, lat2, lon2, year, month) where either end is storm strength."""
  segments = []
  with open(ibtracs_path, encoding="utf-8") as f:
    rows = csv.DictReader(f)
    next(rows)  # Units.
    previous: dict | None = None
    for row in rows:
      year, month = int(row["ISO_TIME"][:4]), int(row["ISO_TIME"][5:7])
      fix = {"sid": row["SID"], "lat": float(row["LAT"]), "lon": float(row["LON"]), "wind": wind(row)}
      if previous and previous["sid"] == fix["sid"] and FIRST_YEAR <= year <= LAST_YEAR:
        strong = any(p["wind"] is not None and p["wind"] >= STORM_KT for p in (previous, fix))
        if strong:
          segments.append((previous["lat"], previous["lon"], fix["lat"], fix["lon"], year, month))
      previous = fix
  return np.array(segments)


def wrap_degrees(degrees: np.ndarray) -> np.ndarray:
  return (degrees + 180) % 360 - 180


def distance_km(lat: float, lon: float, segments: np.ndarray) -> np.ndarray:
  """Distance from a point to each segment, on a flat projection centred on the point."""
  scale = np.cos(np.radians(lat)) * KM_PER_DEGREE
  x1 = wrap_degrees(segments[:, 1] - lon) * scale
  y1 = (segments[:, 0] - lat) * KM_PER_DEGREE
  # Relative to the first fix, so a track crossing the date line stays short.
  dx = wrap_degrees(segments[:, 3] - segments[:, 1]) * scale
  dy = (segments[:, 2] - segments[:, 0]) * KM_PER_DEGREE
  length2 = np.maximum(dx * dx + dy * dy, 1e-9)
  t = np.clip(-(x1 * dx + y1 * dy) / length2, 0, 1)
  return np.hypot(x1 + t * dx, y1 + t * dy)


def main(ibtracs_path: str) -> None:
  segments = storm_segments(ibtracs_path)
  years = LAST_YEAR - FIRST_YEAR + 1
  margin = RADIUS_KM / KM_PER_DEGREE + 3
  data = json.loads(DATA.read_text())
  for point in data["points"]:
    near_lat = (np.abs(segments[:, 0] - point["lat"]) < margin) | (np.abs(segments[:, 2] - point["lat"]) < margin)
    nearby = segments[near_lat]
    hits = nearby[distance_km(point["lat"], point["lon"], nearby) <= RADIUS_KM] if len(nearby) else nearby
    point["storms"] = [round(len({int(y) for y in hits[hits[:, 5] == month, 4]}) / years, 2) for month in range(1, 13)]

  DATA.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")
  exposed = sum(1 for p in data["points"] if max(p["storms"]) > 0)
  print(f"{len(segments)} storm segments; {exposed} of {len(data['points'])} places see storms")


if __name__ == "__main__":
  main(sys.argv[1])
