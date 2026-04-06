from typing import Annotated

from fastapi import APIRouter, Depends, Query

from api.postgres import AsyncSession, get_db_session
from api.weather.schemas import WeatherResponse
from api.weather.service import WeatherService

router = APIRouter(prefix="/weather", tags=["weather"])


@router.get(
    "",
    summary="Get Weather",
    response_model=WeatherResponse,
)
async def get_weather(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    lat: float = Query(..., ge=-90, le=90, description="Latitude."),
    lon: float = Query(..., ge=-180, le=180, description="Longitude."),
) -> WeatherResponse:
    service = WeatherService(session)
    return await service.get_weather(lat, lon)
