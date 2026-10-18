# /// script
# requires-python = ">=3.12"
# dependencies = ["duckdb>=1.1"]
# ///
"""Adds each city's internet speed to src/components/world-climate/climate-data.json.

From Speedtest by Ookla Global Fixed and Mobile Network Performance Maps (CC BY-NC-SA 4.0), Q3 2026: the
test-weighted average download, upload and latency of the tiles within RADIUS_KM of the city. Fixed broadband is
used when it has MIN_TESTS tests there, otherwise mobile.

  curl -L -o /tmp/fixed.parquet "https://ookla-open-data.s3.amazonaws.com/parquet/performance/type=fixed/year=2026/quarter=3/2026-07-01_performance_fixed_tiles.parquet"
  curl -L -o /tmp/mobile.parquet "https://ookla-open-data.s3.amazonaws.com/parquet/performance/type=mobile/year=2026/quarter=3/2026-07-01_performance_mobile_tiles.parquet"
  uv run scripts/build-world-internet.py /tmp/fixed.parquet /tmp/mobile.parquet
"""

import json
import math
import sys
from pathlib import Path

import duckdb

DATA = Path(__file__).parent.parent / "src/components/world-climate/climate-data.json"
RADIUS_KM = 10
MIN_TESTS = 100
KM_PER_DEGREE = 111.32


def speeds(db: duckdb.DuckDBPyConnection, table: str, lat: float, lon: float) -> dict | None:
  dlat = RADIUS_KM / KM_PER_DEGREE
  dlon = dlat / max(math.cos(math.radians(lat)), 0.01)
  row = db.execute(
    f"""
    select sum(tests), sum(avg_d_kbps * tests) / sum(tests), sum(avg_u_kbps * tests) / sum(tests),
      sum(avg_lat_ms * tests) / sum(tests)
    from {table}
    where tile_y between $lat - $dlat and $lat + $dlat
      and tile_x between $lon - $dlon and $lon + $dlon
      and 2 * 6371 * asin(sqrt(
        pow(sin(radians(tile_y - $lat) / 2), 2)
        + cos(radians($lat)) * cos(radians(tile_y)) * pow(sin(radians(tile_x - $lon) / 2), 2)
      )) <= $radius
    """,
    {"lat": lat, "lon": lon, "dlat": dlat, "dlon": dlon, "radius": RADIUS_KM},
  ).fetchone()
  if not row or not row[0] or row[0] < MIN_TESTS:
    return None
  return {"downMbps": round(row[1] / 1000), "upMbps": round(row[2] / 1000), "latencyMs": round(row[3])}


def main(fixed_path: str, mobile_path: str) -> None:
  db = duckdb.connect()
  for table, path in (("fixed", fixed_path), ("mobile", mobile_path)):
    db.execute(f"create table {table} as select tile_x, tile_y, avg_d_kbps, avg_u_kbps, avg_lat_ms, tests from read_parquet(?)", [path])

  data = json.loads(DATA.read_text())
  counts = {"fixed": 0, "mobile": 0, None: 0}
  for point in data["points"]:
    for kind in ("fixed", "mobile"):
      result = speeds(db, kind, point["lat"], point["lon"])
      if result:
        point["internet"] = {**result, "kind": kind}
        counts[kind] += 1
        break
    else:
      point["internet"] = None
      counts[None] += 1

  DATA.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")
  print(f"Fixed for {counts['fixed']}, mobile for {counts['mobile']}, none for {counts[None]}")


if __name__ == "__main__":
  main(sys.argv[1], sys.argv[2])
