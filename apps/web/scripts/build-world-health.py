# /// script
# requires-python = ">=3.12"
# dependencies = ["pycountry>=24.6"]
# ///
"""Adds malaria and the Human Development Index to each country in src/components/world-climate/climate-data.json.

Run after build-world-facts.py, which rebuilds the country list.
- Malaria: WHO's estimated malaria cases (GHO MALARIA_EST_CASES) per 1,000 people (World Bank SP.POP.TOTL),
  for the latest year. Countries WHO doesn't estimate have no local transmission and get 0.
- HDI: UNDP Human Development Report 2025, latest year (0-1).

  curl -L -o /tmp/malaria.json "https://ghoapi.azureedge.net/api/MALARIA_EST_CASES"
  curl -L -o /tmp/population.json "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=20000&date=2024"
  curl -L -o /tmp/hdi.csv "https://hdr.undp.org/sites/default/files/2025_HDR/HDR25_Composite_indices_complete_time_series.csv"
  uv run scripts/build-world-health.py /tmp/malaria.json /tmp/population.json /tmp/hdi.csv node_modules/world-atlas/countries-50m.json
"""

import csv
import json
import sys
from pathlib import Path

import pycountry

DATA = Path(__file__).parent.parent / "src/components/world-climate/climate-data.json"
HDI_YEAR = 2023

ALIASES = {
  "Bolivia": "BOL",
  "Iran": "IRN",
  "Moldova": "MDA",
  "Venezuela": "VEN",
  "Kosovo": "XKX",
  "Taiwan": "TWN",
  "N. Cyprus": "CYP",
  "Somaliland": "SOM",
}


def atlas_codes(atlas_path: str) -> dict[str, str]:
  codes = {}
  for geometry in json.loads(Path(atlas_path).read_text())["objects"]["countries"]["geometries"]:
    name = geometry["properties"]["name"]
    country = pycountry.countries.get(numeric=geometry["id"]) if geometry.get("id") else None
    if country:
      codes[name] = country.alpha_3
    elif name in ALIASES:
      codes[name] = ALIASES[name]
    else:
      try:
        codes[name] = pycountry.countries.search_fuzzy(name)[0].alpha_3
      except LookupError:
        pass
  return codes


def malaria_per_1000(cases_path: str, population_path: str) -> dict[str, float]:
  latest: dict[str, tuple[int, float]] = {}
  for row in json.loads(Path(cases_path).read_text())["value"]:
    if row["SpatialDimType"] != "COUNTRY" or row["NumericValue"] is None:
      continue
    code, year = row["SpatialDim"], row["TimeDim"]
    if code not in latest or year > latest[code][0]:
      latest[code] = (year, row["NumericValue"])
  population = {r["countryiso3code"]: r["value"] for r in json.loads(Path(population_path).read_text())[1] if r["value"]}
  return {code: round(cases / population[code] * 1000, 1) for code, (_, cases) in latest.items() if code in population}


def hdi(hdi_path: str) -> dict[str, float]:
  column = f"hdi_{HDI_YEAR}"
  with open(hdi_path, encoding="latin-1") as f:
    return {row["iso3"]: float(row[column]) for row in csv.DictReader(f) if row.get(column)}


def main(cases_path: str, population_path: str, hdi_path: str, atlas_path: str) -> None:
  codes = atlas_codes(atlas_path)
  malaria = malaria_per_1000(cases_path, population_path)
  development = hdi(hdi_path)

  data = json.loads(DATA.read_text())
  for name, facts in data["countries"].items():
    code = codes.get(name)
    facts["malaria"] = malaria.get(code, 0.0) if code else None
    facts["hdi"] = development.get(code) if code else None

  DATA.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")
  countries = data["countries"].values()
  print(f"{len(countries)} countries: malaria in {sum(1 for c in countries if c['malaria'])}, HDI for {sum(1 for c in countries if c['hdi'] is not None)}")
  print("No code:", sorted(n for n in data["countries"] if n not in codes))


if __name__ == "__main__":
  main(*sys.argv[1:5])
