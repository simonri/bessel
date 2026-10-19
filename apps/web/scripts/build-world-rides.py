# /// script
# requires-python = ">=3.12"
# ///
"""Adds whether a ride-hailing app gets you a car to each city in src/components/world-climate/climate-data.json.

RIDES is a hand-checked list (October 2026), keyed by each place's "lat,lon", built from the operators' own country
and city pages (Uber, Bolt, Grab, Gojek, DiDi, Careem, inDrive, Yango and local apps) and recent news:
- "yes": at least one app reliably gets you a car there.
- "limited": an app exists but with few drivers, airport or hotel restrictions, or legal fights.
- "no": no working app; taxis have to be phoned or hailed.

  uv run scripts/build-world-rides.py scripts/world-rides.json
"""

import json
import sys
from pathlib import Path

DATA = Path(__file__).parent.parent / "src/components/world-climate/climate-data.json"
STATUSES = {"yes", "limited", "no"}


def main(rides_path: str) -> None:
  rides = json.loads(Path(rides_path).read_text())["places"]
  data = json.loads(DATA.read_text())
  missing = []
  for point in data["points"]:
    point["rides"] = None
    if not point["name"]:
      continue
    entry = rides.get(f"{point['lat']},{point['lon']}")
    if entry is None:
      missing.append(point["name"])
      continue
    if entry["status"] not in STATUSES:
      raise ValueError(f"{point['name']}: unknown status {entry['status']!r}")
    point["rides"] = {"status": entry["status"], "apps": entry["apps"]} | ({"note": entry["note"]} if entry.get("note") else {})

  DATA.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")
  statuses = [p["rides"]["status"] for p in data["points"] if p["rides"]]
  print(", ".join(f"{s}: {statuses.count(s)}" for s in ("yes", "limited", "no")), f"- missing: {missing}")


if __name__ == "__main__":
  main(sys.argv[1])
