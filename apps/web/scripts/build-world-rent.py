# /// script
# requires-python = ">=3.12"
# dependencies = ["pycountry>=24.6"]
# ///
"""Adds a month's Airbnb rent to each city in src/components/world-climate/climate-data.json.

- "airbnb": Inside Airbnb (CC BY 4.0) listings within RADIUS_KM of the city, in the same country: the median
  nightly price of entire homes that take only stays of 28+ nights, times 30, in USD at the World Bank's
  official exchange rate (PA.NUS.FCRF). Needs MIN_LISTINGS such homes.
- "estimate": elsewhere, from the country's price level (World Bank PPP factor PA.NUS.PPP over the exchange
  rate), fitted on the measured cities as rent = a * level^b.

Inside Airbnb lists its files at insideairbnb.com/get-the-data; save each visualisations/listings.csv as
<country>_<region>_<city>.csv, using the path segments of its URL.

  curl -L -o /tmp/fx.json "https://api.worldbank.org/v2/country/all/indicator/PA.NUS.FCRF?format=json&per_page=20000&date=2020:2025"
  curl -L -o /tmp/ppp.json "https://api.worldbank.org/v2/country/all/indicator/PA.NUS.PPP?format=json&per_page=20000&date=2018:2025"
  uv run scripts/build-world-rent.py /tmp/insideairbnb /tmp/fx.json /tmp/ppp.json node_modules/world-atlas/countries-50m.json
"""

import csv
import json
import math
import statistics
import sys
from pathlib import Path

import pycountry

DATA = Path(__file__).parent.parent / "src/components/world-climate/climate-data.json"
RADIUS_KM = 15
MIN_LISTINGS = 30
MONTHLY_NIGHTS = 28
KM_PER_DEGREE = 111.32

SLUG_CODES = {
  "the-netherlands": "NLD",
  "united-states": "USA",
  "united-kingdom": "GBR",
  "czech-republic": "CZE",
  "south-africa": "ZAF",
  "turkey": "TUR",
  "taiwan": "TWN",
  "new-zealand": "NZL",
  "china_hk": "HKG",
}


def latest_by_country(path: str) -> dict[str, dict[str, float]]:
  out: dict[str, dict[str, float]] = {}
  for row in json.loads(Path(path).read_text())[1]:
    if row["value"] is not None and row["countryiso3code"]:
      out.setdefault(row["countryiso3code"], {})[row["date"]] = row["value"]
  return out


def file_country(path: Path) -> str:
  slug = path.stem
  for prefix, code in SLUG_CODES.items():
    if slug.startswith(prefix):
      return code
  return pycountry.countries.lookup(slug.split("_")[0].replace("-", " ")).alpha_3


def monthly_listings(listings_dir: str) -> dict[str, list[tuple[float, float, float]]]:
  """(lat, lon, nightly price in local currency) of entire homes for a month or more, by country."""
  out: dict[str, list[tuple[float, float, float]]] = {}
  for path in sorted(Path(listings_dir).glob("*.csv")):
    rows = out.setdefault(file_country(path), [])
    with open(path, encoding="utf-8") as f:
      for row in csv.DictReader(f):
        if row["room_type"] != "Entire home/apt" or not row["price"] or not row["minimum_nights"]:
          continue
        if int(row["minimum_nights"]) >= MONTHLY_NIGHTS:
          rows.append((float(row["latitude"]), float(row["longitude"]), float(row["price"])))
  return out


def within(lat: float, lon: float, listings: list[tuple[float, float, float]]) -> list[float]:
  scale = math.cos(math.radians(lat))
  return [price for l_lat, l_lon, price in listings if math.hypot(l_lat - lat, (l_lon - lon) * scale) * KM_PER_DEGREE <= RADIUS_KM]


def atlas_codes(atlas_path: str) -> dict[str, str]:
  codes = {}
  for geometry in json.loads(Path(atlas_path).read_text())["objects"]["countries"]["geometries"]:
    country = pycountry.countries.get(numeric=geometry["id"]) if geometry.get("id") else None
    if country:
      codes[geometry["properties"]["name"]] = country.alpha_3
  return codes


def main(listings_dir: str, fx_path: str, ppp_path: str, atlas_path: str) -> None:
  fx, ppp = latest_by_country(fx_path), latest_by_country(ppp_path)
  rate = {code: years[max(years)] for code, years in fx.items()}
  level = {}
  for code in fx.keys() & ppp.keys():
    if shared := sorted(fx[code].keys() & ppp[code].keys()):
      level[code] = ppp[code][shared[-1]] / fx[code][shared[-1]]

  codes = atlas_codes(atlas_path)
  listings = monthly_listings(listings_dir)
  data = json.loads(DATA.read_text())
  measured: list[tuple[float, float]] = []
  for point in data["points"]:
    point["rent"] = None
    code = codes.get(point["country"])
    if not point["name"] or code not in listings or code not in rate:
      continue
    prices = within(point["lat"], point["lon"], listings[code])
    if len(prices) >= MIN_LISTINGS:
      usd = statistics.median(prices) * 30 / rate[code]
      point["rent"] = {"usd": round(usd, -1), "basis": "airbnb"}
      if code in level:
        measured.append((math.log(level[code]), math.log(usd)))

  xs, ys = zip(*measured, strict=True)
  b = statistics.covariance(xs, ys) / statistics.variance(xs)
  a = statistics.mean(ys) - b * statistics.mean(xs)
  for point in data["points"]:
    code = codes.get(point["country"])
    if point["name"] and point["rent"] is None and code in level:
      point["rent"] = {"usd": round(math.exp(a + b * math.log(level[code])), -1), "basis": "estimate"}

  DATA.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")
  basis = [p["rent"]["basis"] for p in data["points"] if p["rent"]]
  print(f"Fit on {len(measured)} cities: rent = {math.exp(a):.0f} * level^{b:.2f}")
  print(f"Airbnb for {basis.count('airbnb')}, estimated for {basis.count('estimate')}")


if __name__ == "__main__":
  main(*sys.argv[1:5])
