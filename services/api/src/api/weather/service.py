"""Yr's time series as what people ask about: the weather now, the next hours, and day by day."""

import re
from collections.abc import Iterable
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from api.redis import Redis
from api.weather import yr
from api.weather.schemas import WeatherDay, WeatherForecast, WeatherHour, WeatherNow

MAX_DAYS = 9
MAX_HOURS = 48
_SIMPLE = {"clearsky": "Clear sky", "fair": "Fair", "partlycloudy": "Partly cloudy", "cloudy": "Cloudy", "fog": "Fog"}
# Yr's precipitation symbols: an intensity, the kind, showers or not, with thunder or not. Two of its names
# carry a typo ("lightssleetshowersandthunder"), kept by Yr for compatibility.
_PRECIPITATION = re.compile(r"^(light|lights|heavy)?(rain|sleet|snow)(showers)?(andthunder)?$")


def condition(symbol_code: str | None) -> str | None:
  """Yr's symbol code in words, e.g. 'lightrainshowers_day' is 'Light rain showers'."""
  if not symbol_code:
    return None
  base = symbol_code.split("_")[0]
  if base in _SIMPLE:
    return _SIMPLE[base]
  match = _PRECIPITATION.match(base)
  if match is None:
    return base
  intensity, kind, showers, thunder = match.groups()
  words = ["heavy" if intensity == "heavy" else "light" if intensity else "", kind, "showers" if showers else "", "and thunder" if thunder else ""]
  text = " ".join(word for word in words if word)
  return text[0].upper() + text[1:]


def _at(entry: dict[str, Any]) -> datetime:
  return datetime.fromisoformat(entry["time"].replace("Z", "+00:00"))


def _summary(entry: dict[str, Any], period: str) -> dict[str, Any]:
  return entry["data"].get(period, {}).get("summary", {})


def _details(entry: dict[str, Any], period: str) -> dict[str, Any]:
  return entry["data"].get(period, {}).get("details", {})


def _max(values: Iterable[float | None]) -> float | None:
  present = [v for v in values if v is not None]
  return max(present) if present else None


def _days(series: list[dict[str, Any]], tz: ZoneInfo, first: date, count: int) -> list[WeatherDay]:
  by_day: dict[date, list[dict[str, Any]]] = {}
  for entry in series:
    by_day.setdefault(_at(entry).astimezone(tz).date(), []).append(entry)

  days = []
  covered_until: datetime | None = None
  for offset in range(count):
    day = first + timedelta(days=offset)
    entries = by_day.get(day, [])
    if not entries:
      break
    instants = [e["data"]["instant"]["details"] for e in entries]
    temperatures = [i["air_temperature"] for i in instants]
    for entry in entries:
      six = _details(entry, "next_6_hours")
      temperatures += [t for t in (six.get("air_temperature_min"), six.get("air_temperature_max")) if t is not None]

    # Each stretch of time counts once: hourly amounts while Yr has them, six-hourly after.
    precipitation = 0.0
    for entry in entries:
      start = _at(entry)
      if covered_until is not None and start < covered_until:
        continue
      for period, hours in (("next_1_hours", 1), ("next_6_hours", 6)):
        amount = _details(entry, period).get("precipitation_amount")
        if amount is not None:
          precipitation += amount
          covered_until = start + timedelta(hours=hours)
          break

    midday = datetime.combine(day, time(12), tzinfo=tz)
    with_symbol = [e for e in entries if _summary(e, "next_6_hours").get("symbol_code") or _summary(e, "next_1_hours").get("symbol_code")]
    closest = min(with_symbol, key=lambda e: abs(_at(e) - midday), default=None)
    symbol = (_summary(closest, "next_6_hours").get("symbol_code") or _summary(closest, "next_1_hours").get("symbol_code")) if closest else None

    days.append(
      WeatherDay(
        date=day,
        temperature_min=min(temperatures),
        temperature_max=max(temperatures),
        condition=condition(symbol),
        precipitation=round(precipitation, 1),
        precipitation_probability_max=_max(_details(e, p).get("probability_of_precipitation") for e in entries for p in ("next_1_hours", "next_6_hours")),
        thunder_probability_max=_max(_details(e, "next_1_hours").get("probability_of_thunder") for e in entries),
        wind_speed_max=max(i["wind_speed"] for i in instants),
        wind_gust_max=_max(i.get("wind_speed_of_gust") for i in instants),
      )
    )
  return days


def summarize(
  forecast: dict[str, Any], tz: ZoneInfo, *, now: datetime, days: int, hours: int, location: str | None, latitude: float, longitude: float
) -> WeatherForecast:
  series = forecast["properties"]["timeseries"]
  # The current hour, then everything after it.
  upcoming = [e for e in series if _at(e) > now - timedelta(hours=1)] or series[-1:]
  current = upcoming[0]
  instant = current["data"]["instant"]["details"]
  return WeatherForecast(
    location=location,
    latitude=latitude,
    longitude=longitude,
    timezone=tz.key,
    updated_at=datetime.fromisoformat(forecast["properties"]["meta"]["updated_at"].replace("Z", "+00:00")),
    now=WeatherNow(
      time=_at(current).astimezone(tz),
      temperature=instant["air_temperature"],
      feels_like=instant.get("apparent_air_temperature"),
      condition=condition(_summary(current, "next_1_hours").get("symbol_code") or _summary(current, "next_6_hours").get("symbol_code")),
      precipitation_next_hour=_details(current, "next_1_hours").get("precipitation_amount"),
      wind_speed=instant["wind_speed"],
      wind_gust=instant.get("wind_speed_of_gust"),
      wind_from_direction=instant["wind_from_direction"],
      humidity=instant["relative_humidity"],
    ),
    hours=[
      WeatherHour(
        time=_at(e).astimezone(tz),
        temperature=e["data"]["instant"]["details"]["air_temperature"],
        condition=condition(_summary(e, "next_1_hours").get("symbol_code")),
        precipitation=_details(e, "next_1_hours").get("precipitation_amount"),
        precipitation_probability=_details(e, "next_1_hours").get("probability_of_precipitation"),
        wind_speed=e["data"]["instant"]["details"]["wind_speed"],
      )
      for e in upcoming
      if "next_1_hours" in e["data"]
    ][:hours],
    days=_days(series, tz, now.astimezone(tz).date(), days),
  )


async def weather_forecast(
  redis: Redis, latitude: float, longitude: float, tz: ZoneInfo, *, now: datetime, days: int = MAX_DAYS, hours: int = 24, location: str | None = None
) -> WeatherForecast:
  forecast = await yr.locationforecast(redis, latitude, longitude)
  return summarize(forecast, tz, now=now, days=days, hours=hours, location=location, latitude=latitude, longitude=longitude)
