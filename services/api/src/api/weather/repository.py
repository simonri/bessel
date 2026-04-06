from datetime import date

from api.common.repository.base import RepositoryBase
from api.models.weather_cache import WeatherCache


class WeatherCacheRepository(RepositoryBase[WeatherCache]):
    model = WeatherCache

    async def get_by_location_and_date(self, lat: float, lon: float, target_date: date) -> WeatherCache | None:
        statement = self.get_base_statement().where(
            WeatherCache.date == target_date,
            WeatherCache.lat == lat,
            WeatherCache.lon == lon,
        )
        return await self.get_one_or_none(statement)
