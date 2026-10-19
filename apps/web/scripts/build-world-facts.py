# /// script
# requires-python = ">=3.12"
# dependencies = ["pycountry>=24.6"]
# ///
"""Adds salary, tap water and Airbnb facts to src/components/world-climate/climate-data.json.

Salary is per country: the median monthly salary after tax, in USD.
- "survey": WhereNext's after-tax medians (CC BY 4.0), getwherenext.com/data/median-salaries-2026.
- "estimate": ILOSTAT's median monthly earnings of employees in USD (gross, DF_EAR_EMTM_SEX_CUR_NB),
  times the net/gross ratio of the five WhereNext countries with the nearest gross median.
Tap water follows CDC traveller guidance per country. Airbnb is per city: whether it operates in
the country, and city rules that ban or heavily restrict short stays (checked October 2026).

  curl -L -o /tmp/wherenext.csv "https://getwherenext.com/api/data/median-salaries?format=csv"
  curl -L -o /tmp/ilo.csv "https://sdmx.ilo.org/rest/data/ILO,DF_EAR_EMTM_SEX_CUR_NB/?startPeriod=2014&format=csvfilewithlabels"
  uv run scripts/build-world-facts.py /tmp/wherenext.csv /tmp/ilo.csv node_modules/world-atlas/countries-50m.json
"""

import csv
import json
import statistics
import sys
from pathlib import Path

import pycountry

DATA = Path(__file__).parent.parent / "src/components/world-climate/climate-data.json"
OLDEST_ILO_YEAR = 2016
NEIGHBOURS = 5

# CDC Travelers' Health "food and water" guidance, as compiled December 2025.
TAP_WATER_SAFE = """Aruba, Australia, Austria, Bahrain, Belgium, Bermuda, Canada, Chile, Cook Islands, Costa Rica,
Croatia, Curaçao, Czechia, Denmark, Estonia, Finland, France, Germany, Greece, Greenland, Guadeloupe, Hungary,
Iceland, Ireland, Isle of Man, Israel, Italy, Japan, Kuwait, Liechtenstein, Luxembourg, Malta, Martinique, Monaco,
Netherlands, New Caledonia, New Zealand, Norway, Palau, Poland, Portugal, Puerto Rico, Réunion, Saint Helena,
San Marino, Saudi Arabia, Singapore, Slovakia, Slovenia, Korea, Republic of, Spain, Sweden, Switzerland,
United Arab Emirates, United Kingdom, United States, Virgin Islands, U.S."""
TAP_WATER_UNSAFE = """Afghanistan, Albania, Algeria, American Samoa, Angola, Anguilla, Antigua and Barbuda, Argentina,
Armenia, Azerbaijan, Bahamas, Bangladesh, Barbados, Belarus, Belize, Benin, Bhutan, Bolivia, Bosnia and Herzegovina,
Botswana, Brazil, British Indian Ocean Territory, Brunei Darussalam, Bulgaria, Burkina Faso, Burundi, Cambodia,
Cameroon, Cabo Verde, Cayman Islands, Central African Republic, Chad, China, Christmas Island,
Cocos (Keeling) Islands, Colombia, Comoros, Congo, Côte d'Ivoire, Cuba, Cyprus, Congo, The Democratic Republic of the,
Djibouti, Dominica, Dominican Republic, Ecuador, Egypt, El Salvador, Equatorial Guinea, Eritrea, Eswatini, Ethiopia,
Falkland Islands (Malvinas), Faroe Islands, Fiji, French Guiana, French Polynesia, Gabon, Gambia, Georgia, Ghana,
Gibraltar, Grenada, Guam, Guatemala, Guinea, Guinea-Bissau, Guyana, Haiti, Honduras, Hong Kong, India, Indonesia,
Iran, Iraq, Jamaica, Kazakhstan, Kenya, Kiribati, Kosovo, Kyrgyzstan, Lao People's Democratic Republic, Latvia,
Lebanon, Lesotho, Liberia, Libya, Lithuania, Macao, Madagascar, Malawi, Malaysia, Maldives, Mali, Marshall Islands,
Mauritania, Mauritius, Mayotte, Mexico, Micronesia, Federated States of, Moldova, Mongolia, Montenegro, Montserrat,
Morocco, Mozambique, Myanmar, Namibia, Nauru, Nepal, Nicaragua, Niger, Nigeria, Niue, Norfolk Island,
Korea, Democratic People's Republic of, North Macedonia, Oman, Pakistan, Panama, Papua New Guinea, Paraguay, Peru,
Philippines, Pitcairn, Qatar, Romania, Russian Federation, Rwanda, Saint Barthélemy, Saint Kitts and Nevis,
Saint Lucia, Saint Martin (French part), Saint Pierre and Miquelon, Saint Vincent and the Grenadines, Samoa,
Sao Tome and Principe, Senegal, Serbia, Seychelles, Sierra Leone, Sint Maarten (Dutch part), Solomon Islands,
Somalia, South Africa, South Georgia and the South Sandwich Islands, South Sudan, Sri Lanka, Sudan, Suriname,
Syrian Arab Republic, Taiwan, Tajikistan, Thailand, Timor-Leste, Togo, Tokelau, Tonga, Trinidad and Tobago, Tunisia,
Türkiye, Turkmenistan, Turks and Caicos Islands, Tuvalu, Uganda, Ukraine, Uruguay, Uzbekistan, Vanuatu, Venezuela,
Viet Nam, Virgin Islands, British, Yemen, Zambia, Zimbabwe"""

# Airbnb doesn't operate here at all (sanctions, or it withdrew).
AIRBNB_UNAVAILABLE = {
  "RUS": "Airbnb suspended operations in Russia in 2022",
  "BLR": "Airbnb suspended operations in Belarus in 2022",
  "CHN": "Airbnb removed all mainland China listings in July 2022",
  "IRN": "Not available under US sanctions",
  "SYR": "Not available under US sanctions",
  "PRK": "Not available under US sanctions",
  "MMR": "Airbnb removed its Myanmar listings",
}
# City rules, keyed by (country ISO3, city name as on the map).
AIRBNB_CITY = {
  ("SGP", "Singapore"): ("banned", "Homes can't be let for under 3 months (6 for HDB flats)"),
  ("ESP", "Barcelona"): ("restricted", "No new licences; all tourist flats close by November 2028"),
  ("HUN", "Budapest"): ("restricted", "Banned in District VI from 2026; no new registrations city-wide through 2026"),
  ("NLD", "Amsterdam"): ("restricted", "Permit needed; at most 30 nights a year"),
  ("GBR", "London"): ("restricted", "Whole homes at most 90 nights a year"),
  ("FRA", "Paris"): ("restricted", "Main home only, at most 90 nights a year"),
  ("DEU", "Berlin"): ("restricted", "Permit needed for every short-term let"),
  ("CAN", "Vancouver"): ("restricted", "Host's own principal residence only"),
  ("THA", "Bangkok"): ("restricted", "Stays under 30 days need a hotel licence"),
  ("THA", "Chiang Mai"): ("restricted", "Stays under 30 days need a hotel licence"),
  ("JPN", "Tokyo"): ("restricted", "Registered hosts only, at most 180 nights a year"),
  ("JPN", "Ōsaka"): ("restricted", "Registered hosts only, at most 180 nights a year"),
  ("THA", "Phuket"): ("restricted", "Stays under 30 days need a hotel licence"),
  ("THA", "Ko Samui"): ("restricted", "Stays under 30 days need a hotel licence"),
  ("THA", "Ko Pha Ngan"): ("restricted", "Stays under 30 days need a hotel licence"),
  ("THA", "Krabi"): ("restricted", "Stays under 30 days need a hotel licence"),
  ("THA", "Hua Hin"): ("restricted", "Stays under 30 days need a hotel licence"),
  ("THA", "Pattaya"): ("restricted", "Stays under 30 days need a hotel licence"),
  ("JPN", "Naha (Okinawa)"): ("restricted", "Registered hosts only, at most 180 nights a year"),
  ("JPN", "Kyoto"): ("restricted", "Registered hosts only; homes in residential areas only mid-January to mid-March"),
  ("JPN", "Fukuoka"): ("restricted", "Registered hosts only, at most 180 nights a year"),
  ("ESP", "Palma (Mallorca)"): ("restricted", "Holiday lets banned in flats"),
  ("ESP", "Ibiza"): ("restricted", "Holiday lets banned in flats"),
  ("ESP", "Valencia"): ("restricted", "No new tourist flat licences in the centre"),
  ("ESP", "Málaga"): ("restricted", "No new tourist flat licences in most central areas"),
  ("USA", "Honolulu"): ("restricted", "Stays under 90 days only in resort zones"),
  ("USA", "Lahaina (Maui)"): ("restricted", "Short stays in apartment districts being phased out"),
  ("USA", "New York"): ("banned", "Whole homes can't be let for under 30 days"),
  ("USA", "San Francisco"): ("restricted", "Registered hosts only, whole homes at most 90 nights a year"),
}

ALIASES = {
  "Bolivia": "BOL",
  "Iran": "IRN",
  "Moldova": "MDA",
  "Venezuela": "VEN",
  "Kosovo": "XKX",
  "Taiwan": "TWN",
  "Micronesia, Federated States of": "FSM",
}


def iso3(name: str) -> str | None:
  if name in ALIASES:
    return ALIASES[name]
  try:
    return pycountry.countries.lookup(name).alpha_3
  except LookupError:
    try:
      return pycountry.countries.search_fuzzy(name)[0].alpha_3
    except LookupError:
      return None


def country_list(text: str) -> set[str]:
  names = [n.strip() for n in text.replace("\n", " ").split(", ") if n.strip()]
  # Names with a comma ("Korea, Republic of") were split; rejoin the halves pycountry knows.
  codes: set[str] = set()
  i = 0
  while i < len(names):
    joined = f"{names[i]}, {names[i + 1]}" if i + 1 < len(names) else None
    if joined and iso3(joined) and "," not in names[i]:
      try:
        pycountry.countries.lookup(joined)
        codes.add(pycountry.countries.lookup(joined).alpha_3)
        i += 2
        continue
      except LookupError:
        pass
    code = iso3(names[i])
    if code is None:
      raise ValueError(f"unknown country in CDC list: {names[i]}")
    codes.add(code)
    i += 1
  return codes


def salaries(wherenext_csv: str, ilo_csv: str) -> dict[str, dict]:
  survey = {}
  for row in csv.DictReader(open(wherenext_csv, encoding="utf-8")):
    code = pycountry.countries.get(alpha_2=row["countryCode"]).alpha_3
    gross, net = float(row["medianGrossUSD"]) / 12, float(row["medianNetUSD"]) / 12
    survey[code] = {"gross": gross, "net": net, "year": int(row["dataYear"])}

  ilo = {}
  for row in csv.DictReader(open(ilo_csv, encoding="utf-8")):
    if row["SEX"] != "SEX_T" or row["CUR"] != "CUR_TYPE_USD" or not row["OBS_VALUE"]:
      continue
    year = int(row["TIME_PERIOD"])
    if year < OLDEST_ILO_YEAR:
      continue
    code = row["REF_AREA"]
    if code not in ilo or year > ilo[code]["year"]:
      ilo[code] = {"gross": float(row["OBS_VALUE"]), "year": year}

  out = {code: {"usd": round(s["net"]), "basis": "survey", "year": s["year"]} for code, s in survey.items()}
  for code, row in ilo.items():
    if code in out:
      continue
    nearest = sorted(survey.values(), key=lambda s: abs(s["gross"] - row["gross"]))[:NEIGHBOURS]
    ratio = statistics.mean(s["net"] / s["gross"] for s in nearest)
    out[code] = {"usd": round(row["gross"] * ratio), "basis": "estimate", "year": row["year"]}
  return out


def main(wherenext_csv: str, ilo_csv: str, atlas_path: str) -> None:
  atlas = json.loads(Path(atlas_path).read_text())
  name_to_code: dict[str, str | None] = {}
  for geometry in atlas["objects"]["countries"]["geometries"]:
    name = geometry["properties"]["name"]
    numeric = geometry.get("id")
    country = pycountry.countries.get(numeric=numeric) if numeric else None
    name_to_code[name] = country.alpha_3 if country else iso3(name)

  safe, unsafe = country_list(TAP_WATER_SAFE), country_list(TAP_WATER_UNSAFE)
  pay = salaries(wherenext_csv, ilo_csv)

  data = json.loads(DATA.read_text())
  countries: dict[str, dict] = {}
  for point in data["points"]:
    code = name_to_code.get(point["country"])
    if point["country"] not in countries:
      countries[point["country"]] = {
        "salary": pay.get(code) if code else None,
        "tapWater": "safe" if code in safe else "unsafe" if code in unsafe else None,
      }
    if code in AIRBNB_UNAVAILABLE:
      point["airbnb"] = {"status": "unavailable", "note": AIRBNB_UNAVAILABLE[code]}
    elif (code, point["name"]) in AIRBNB_CITY:
      status, note = AIRBNB_CITY[(code, point["name"])]
      point["airbnb"] = {"status": status, "note": note}
    else:
      point["airbnb"] = {"status": "allowed"}
  data["countries"] = countries

  DATA.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")
  with_pay = sum(1 for c in countries.values() if c["salary"])
  with_water = sum(1 for c in countries.values() if c["tapWater"])
  print(f"{len(countries)} countries: salary for {with_pay}, tap water for {with_water}")


if __name__ == "__main__":
  main(sys.argv[1], sys.argv[2], sys.argv[3])
