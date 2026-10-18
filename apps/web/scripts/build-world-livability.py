# /// script
# requires-python = ">=3.12"
# dependencies = ["pycountry>=24.6"]
# ///
"""Adds malaria, the Human Development Index and safety to each country in src/components/world-climate/climate-data.json.

Run after build-world-facts.py, which rebuilds the country list.
- Malaria: WHO's estimated malaria cases (GHO MALARIA_EST_CASES) per 1,000 people (World Bank SP.POP.TOTL),
  for the latest year. Countries WHO doesn't estimate have no local transmission and get 0.
- HDI: UNDP Human Development Report 2025, latest year (0-1).
- Advisory: the US State Department travel advisory level (1-4), matched by the country name in each title.
  The US and its territories have none, so they count as level 1.
- Homicides: intentional homicides per 100,000 people (World Bank VC.IHR.PSRC.P5, from UNODC), latest year.

  curl -L -o /tmp/malaria.json "https://ghoapi.azureedge.net/api/MALARIA_EST_CASES"
  curl -L -o /tmp/population.json "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=20000&date=2024"
  curl -L -o /tmp/hdi.csv "https://hdr.undp.org/sites/default/files/2025_HDR/HDR25_Composite_indices_complete_time_series.csv"
  curl -L -o /tmp/advisories.json "https://cadataapi.state.gov/api/TravelAdvisories"
  curl -L -o /tmp/homicides.json "https://api.worldbank.org/v2/country/all/indicator/VC.IHR.PSRC.P5?format=json&per_page=20000&date=2014:2024"
  uv run scripts/build-world-livability.py /tmp/malaria.json /tmp/population.json /tmp/hdi.csv /tmp/advisories.json \\
    /tmp/homicides.json node_modules/world-atlas/countries-50m.json
"""

import csv
import json
import re
import sys
from pathlib import Path

import pycountry

DATA = Path(__file__).parent.parent / "src/components/world-climate/climate-data.json"
HDI_YEAR = 2023
US_SOIL = {"USA", "PRI", "GUM", "VIR", "ASM", "MNP", "UMI"}
ADVISORY_ALIASES = {
  "Burma": ["MMR"],
  "Kingdom of Denmark": ["DNK"],
  "West Bank": ["PSE"],
  "French West Indies": ["GLP", "MTQ", "BLM", "MAF"],
  "French Saint Martin": ["MAF"],
  "Sint Maarten": ["SXM"],
  "Saba and Sint Eustatius": ["BES"],
  "Macau": ["MAC"],
  "Kosovo": ["XKX"],
  "Turkey": ["TUR"],
  "Côte d’Ivoire": ["CIV"],
  "The Kyrgyz Republic": ["KGZ"],
  "Democratic Republic of the Congo": ["COD"],
  "Republic of Congo": ["COG"],
  "São Tomé and Príncipe": ["STP"],
  "Saint Barthelemy": ["BLM"],
  "Bonaire": ["BES"],
  "The Bahamas": ["BHS"],
  "Brunei": ["BRN"],
  "The Gambia": ["GMB"],
  "Russia": ["RUS"],
}

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


def advisory_levels(advisories_path: str) -> dict[str, int]:
  levels: dict[str, int] = {}
  for advisory in json.loads(Path(advisories_path).read_text()):
    match = re.match(r"(.+?)(?: Travel Advisory)? - Level (\d)", advisory["Title"])
    if not match:
      raise ValueError(f"unexpected advisory title: {advisory['Title']}")
    name, level = match.group(1).strip(), int(match.group(2))
    if name == "Gaza":
      continue
    if name in ADVISORY_ALIASES:
      codes = ADVISORY_ALIASES[name]
    else:
      try:
        codes = [pycountry.countries.lookup(name).alpha_3]
      except LookupError:
        print("Unmatched advisory:", name)
        continue
    for code in codes:
      levels.setdefault(code, level)
  return levels | dict.fromkeys(US_SOIL, 1)


def homicides_per_100k(homicides_path: str) -> dict[str, float]:
  latest: dict[str, tuple[str, float]] = {}
  for row in json.loads(Path(homicides_path).read_text())[1]:
    code = row["countryiso3code"]
    if row["value"] is None or not code:
      continue
    if code not in latest or row["date"] > latest[code][0]:
      latest[code] = (row["date"], row["value"])
  return {code: round(value, 1) for code, (_, value) in latest.items()}


def main(
  cases_path: str,
  population_path: str,
  hdi_path: str,
  advisories_path: str,
  homicides_path: str,
  atlas_path: str,
) -> None:
  codes = atlas_codes(atlas_path)
  malaria = malaria_per_1000(cases_path, population_path)
  development = hdi(hdi_path)
  advisories = advisory_levels(advisories_path)
  homicides = homicides_per_100k(homicides_path)

  data = json.loads(DATA.read_text())
  for name, facts in data["countries"].items():
    code = codes.get(name)
    facts["malaria"] = malaria.get(code, 0.0) if code else None
    facts["hdi"] = development.get(code) if code else None
    facts["advisory"] = advisories.get(code) if code else None
    facts["homicides"] = homicides.get(code) if code else None

  DATA.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")
  countries = data["countries"].values()
  print(f"{len(countries)} countries: malaria in {sum(1 for c in countries if c['malaria'])}, HDI for {sum(1 for c in countries if c['hdi'] is not None)}")
  print(f"Advisory for {sum(1 for c in countries if c['advisory'])}, homicides for {sum(1 for c in countries if c['homicides'] is not None)}")
  print("No code:", sorted(n for n in data["countries"] if n not in codes))
  print("No advisory:", sorted(n for n, c in data["countries"].items() if c["advisory"] is None))


if __name__ == "__main__":
  main(*sys.argv[1:7])
