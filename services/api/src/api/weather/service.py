from datetime import date

import httpx

from api.common.db.postgres import AsyncSession
from api.models.weather_cache import WeatherCache
from api.weather.repository import WeatherCacheRepository
from api.weather.schemas import WeatherResponse, weather_label_from_code

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


class WeatherService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = WeatherCacheRepository.from_session(session)

    async def get_weather(self, lat: float, lon: float) -> WeatherResponse:
        rounded_lat = round(lat, 2)
        rounded_lon = round(lon, 2)
        today = date.today()

        cached = await self.repo.get_by_location_and_date(rounded_lat, rounded_lon, today)
        if cached:
            return WeatherResponse(
                date=cached.date,
                temperature_max=cached.temperature_max,
                temperature_min=cached.temperature_min,
                weather_code=cached.weather_code,
                weather_label=weather_label_from_code(cached.weather_code),
            )

        async with httpx.AsyncClient() as client:
            response = await client.get(
                OPEN_METEO_URL,
                params={
                    "latitude": rounded_lat,
                    "longitude": rounded_lon,
                    "daily": "temperature_2m_max,temperature_2m_min,weather_code",
                    "timezone": "auto",
                    "forecast_days": 1,
                },
            )
            response.raise_for_status()
            data = response.json()

        daily = data["daily"]
        temp_max = daily["temperature_2m_max"][0]
        temp_min = daily["temperature_2m_min"][0]
        weather_code = daily["weather_code"][0]

        cache_entry = WeatherCache(
            date=today,
            lat=rounded_lat,
            lon=rounded_lon,
            temperature_max=temp_max,
            temperature_min=temp_min,
            weather_code=weather_code,
        )
        await self.repo.create(cache_entry, flush=True)

        return WeatherResponse(
            date=today,
            temperature_max=temp_max,
            temperature_min=temp_min,
            weather_code=weather_code,
            weather_label=weather_label_from_code(weather_code),
        )
