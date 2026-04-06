from typing import Annotated

from fastapi import APIRouter, Depends, Query

from api.postgres import AsyncSession, get_db_session
from api.weather.schemas import WeatherForecastResponse
from api.weather.service import WeatherService

router = APIRouter(prefix="/weather", tags=["weather"])


@router.get(
  "",
  summary="Get Weather Forecast",
  response_model=WeatherForecastResponse,
)
async def get_weather_forecast(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  lat: float = Query(..., ge=-90, le=90, description="Latitude."),
  lon: float = Query(..., ge=-180, le=180, description="Longitude."),
) -> WeatherForecastResponse:
  service = WeatherService(session)
  return await service.get_forecast(lat, lon)
