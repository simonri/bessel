from collections.abc import Sequence
from datetime import date

from api.common.repository.base import RepositoryBase
from api.models.weather_cache import WeatherCache


class WeatherCacheRepository(RepositoryBase[WeatherCache]):
  model = WeatherCache

  async def get_by_location_and_date_range(
    self, lat: float, lon: float, start: date, end: date
  ) -> Sequence[WeatherCache]:
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
