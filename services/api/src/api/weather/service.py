from datetime import date, timedelta

import httpx
from sqlalchemy.dialects.postgresql import insert as pg_insert

from api.common.db.postgres import AsyncSession
from api.models.weather_cache import WeatherCache
from api.weather.repository import WeatherCacheRepository
from api.weather.schemas import WeatherDaySchema, WeatherForecastResponse, weather_label_from_code

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
FORECAST_DAYS = 10


class WeatherService:
  def __init__(self, session: AsyncSession) -> None:
    self.session = session
    self.repo = WeatherCacheRepository.from_session(session)

  async def get_forecast(self, lat: float, lon: float) -> WeatherForecastResponse:
    rounded_lat = round(lat, 2)
    rounded_lon = round(lon, 2)
    today = date.today()
    end_date = today + timedelta(days=FORECAST_DAYS - 1)

    cached = await self.repo.get_by_location_and_date_range(rounded_lat, rounded_lon, today, end_date)
    cached_dates = {entry.date for entry in cached}

    if len(cached_dates) == FORECAST_DAYS:
      return WeatherForecastResponse(
        days=[self._to_schema(entry) for entry in cached],
      )

    async with httpx.AsyncClient() as client:
      response = await client.get(
        OPEN_METEO_URL,
        params={
          "latitude": rounded_lat,
          "longitude": rounded_lon,
          "daily": ",".join(
            [
              "temperature_2m_max",
              "temperature_2m_min",
              "apparent_temperature_max",
              "precipitation_probability_max",
              "weather_code",
            ]
          ),
          "timezone": "auto",
          "forecast_days": FORECAST_DAYS,
        },
      )
      response.raise_for_status()
      data = response.json()

    daily = data["daily"]
    days: list[WeatherDaySchema] = []

    for i in range(FORECAST_DAYS):
      day_date = date.fromisoformat(daily["time"][i])

      if day_date not in cached_dates:
        stmt = (
          pg_insert(WeatherCache)
          .values(
            date=day_date,
            lat=rounded_lat,
            lon=rounded_lon,
            temperature_max=daily["temperature_2m_max"][i],
            temperature_min=daily["temperature_2m_min"][i],
            apparent_temperature_max=daily["apparent_temperature_max"][i],
            precipitation_probability_max=daily["precipitation_probability_max"][i] or 0,
            weather_code=daily["weather_code"][i],
          )
          .on_conflict_do_nothing(index_elements=["date", "lat", "lon"])
          .returning(WeatherCache)
        )
        result = await self.session.execute(stmt)
        entry = result.scalar_one_or_none()
        if entry is None:
          # Race condition: another request inserted it first, fetch it
          refetched = await self.repo.get_by_location_and_date_range(rounded_lat, rounded_lon, day_date, day_date)
          entry = refetched[0]

        days.append(self._to_schema(entry))
      else:
        existing = next(c for c in cached if c.date == day_date)
        days.append(self._to_schema(existing))

    await self.session.flush()
    return WeatherForecastResponse(days=days)

  @staticmethod
  def _to_schema(entry: WeatherCache) -> WeatherDaySchema:
    return WeatherDaySchema(
      date=entry.date,
      temperature_max=entry.temperature_max,
      temperature_min=entry.temperature_min,
      apparent_temperature_max=entry.apparent_temperature_max,
      precipitation_probability_max=entry.precipitation_probability_max,
      weather_code=entry.weather_code,
      weather_label=weather_label_from_code(entry.weather_code),
    )
