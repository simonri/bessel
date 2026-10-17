# /// script
# requires-python = ">=3.12"
# dependencies = ["h5py>=3.12", "numpy>=2.1"]
# ///
"""Adds the sea to src/components/world-climate/climate-data.json.

For every place: the distance to the nearest ocean coastline (Natural Earth
50m) and that sea's monthly average surface temperature (NOAA OISST v2
high-res, 1991-2020 means, 0.25 deg), read at the ocean cell nearest that
coast point. Run after build-world-climate.mjs:

  curl -L -o /tmp/sst.mon.ltm.nc https://downloads.psl.noaa.gov/Datasets/noaa.oisst.v2.highres/sst.mon.ltm.1991-2020.nc
  curl -L -o /tmp/coastline.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_coastline.geojson
  uv run scripts/build-world-sea.py /tmp/sst.mon.ltm.nc /tmp/coastline.geojson
"""

import json
import sys
from pathlib import Path

import h5py
import numpy as np

EARTH_RADIUS_KM = 6371.0
DATA = Path(__file__).parent.parent / "src/components/world-climate/climate-data.json"


def haversine_km(lat: float, lon: float, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
  lat1, lon1 = np.radians(lat), np.radians(lon)
  lat2, lon2 = np.radians(lats), np.radians(lons)
  a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
  return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(a))


def coast_vertices(path: str) -> tuple[np.ndarray, np.ndarray]:
  coords: list[list[float]] = []
  for feature in json.loads(Path(path).read_text())["features"]:
    geometry = feature["geometry"]
    lines = geometry["coordinates"] if geometry["type"] == "MultiLineString" else [geometry["coordinates"]]
    for line in lines:
      coords.extend(line)
  arr = np.array(coords)
  return arr[:, 1], arr[:, 0]


def main(sst_path: str, coast_path: str) -> None:
  coast_lat, coast_lon = coast_vertices(coast_path)
  with h5py.File(sst_path, "r") as f:
    sst = f["sst"][:]
    grid_lat = f["lat"][:]
    grid_lon = f["lon"][:]
  sst = np.where((sst < -3) | (sst > 45), np.nan, sst)
  ocean = ~np.isnan(sst).all(axis=0)

  data = json.loads(DATA.read_text())
  for point in data["points"]:
    distances = haversine_km(point["lat"], point["lon"], coast_lat, coast_lon)
    nearest = int(np.argmin(distances))
    point["seaKm"] = int(round(float(distances[nearest])))

    # The ocean cell nearest the coast point, searching outwards.
    lat0, lon0 = float(coast_lat[nearest]), float(coast_lon[nearest]) % 360
    i0 = int(np.abs(grid_lat - lat0).argmin())
    j0 = int(np.abs(grid_lon - lon0).argmin())
    for radius in (4, 12, 40):
      rows = np.arange(max(i0 - radius, 0), min(i0 + radius + 1, len(grid_lat)))
      cols = np.arange(j0 - radius, j0 + radius + 1) % len(grid_lon)
      window = ocean[np.ix_(rows, cols)]
      if window.any():
        ri, ci = np.nonzero(window)
        cand_lat, cand_lon = grid_lat[rows[ri]], grid_lon[cols[ci]]
        best = int(np.argmin(haversine_km(lat0, lon0, cand_lat, cand_lon)))
        temps = sst[:, rows[ri[best]], cols[ci[best]]]
        point["seaTemps"] = [round(float(t), 1) for t in temps]
        break
    else:
      raise RuntimeError(f"no ocean near {point['country']} {point['name']}")

  DATA.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")
  print(f"added the sea to {len(data['points'])} places")


if __name__ == "__main__":
  main(sys.argv[1], sys.argv[2])
