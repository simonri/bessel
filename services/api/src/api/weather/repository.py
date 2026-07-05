from collections.abc import Sequence
from datetime import date

from sqlalchemy.dialects.postgresql import insert as pg_insert

from api.common.repository.base import RepositoryBase
from api.models.weather_cache import WeatherCache


class WeatherCacheRepository(RepositoryBase[WeatherCache]):
  model = WeatherCache

  async def upsert_day(
    self,
    *,
    day: date,
    lat: float,
    lon: float,
    temperature_max: float,
    temperature_min: float,
    apparent_temperature_max: float,
    precipitation_probability_max: int,
    weather_code: int,
  ) -> WeatherCache:
    values = {
      "date": day,
      "lat": lat,
      "lon": lon,
      "temperature_max": temperature_max,
      "temperature_min": temperature_min,
      "apparent_temperature_max": apparent_temperature_max,
      "precipitation_probability_max": precipitation_probability_max,
      "weather_code": weather_code,
    }
    key = ("date", "lat", "lon")
    statement = (
      pg_insert(WeatherCache)
      .values(**values)
      .on_conflict_do_update(
        index_elements=list(key),
        set_={k: v for k, v in values.items() if k not in key},
      )
      .returning(WeatherCache)
    )
    result = await self.session.execute(statement)
    return result.scalars().one()

  async def get_by_location_and_date_range(self, lat: float, lon: float, start: date, end: date) -> Sequence[WeatherCache]:
    statement = (
      self.get_base_statement()
      .where(
        WeatherCache.lat == lat,
        WeatherCache.lon == lon,
        WeatherCache.date >= start,
        WeatherCache.date <= end,
      )
      .order_by(WeatherCache.date)
    )
    return await self.get_all(statement)
