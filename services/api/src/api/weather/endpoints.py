from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Query

from api.common.utils import utc_now
from api.exceptions import ValidationError
from api.redis import Redis, get_redis
from api.users.dependencies import CurrentDBUser
from api.weather.schemas import WeatherForecast
from api.weather.service import MAX_DAYS, MAX_HOURS, weather_forecast

router = APIRouter(prefix="/weather", tags=["weather"])


@router.get("", summary="Get Weather Forecast", response_model=WeatherForecast)
async def get_weather_forecast(
  redis: Annotated[Redis, Depends(get_redis)],
  current_user: CurrentDBUser,
  lat: float = Query(..., ge=-90, le=90, description="Latitude."),
  lon: float = Query(..., ge=-180, le=180, description="Longitude."),
  days: int = Query(MAX_DAYS, ge=1, le=MAX_DAYS, description="How many days, starting today."),
  hours: int = Query(24, ge=0, le=MAX_HOURS, description="How many of the next hours, one by one."),
  timezone: str | None = Query(None, description="IANA zone the days and times are in; defaults to the user's own."),
) -> WeatherForecast:
  """Yr's forecast for a point: the weather now, the next hours and day by day."""
  try:
    tz = ZoneInfo(timezone or current_user.timezone or "UTC")
  except (ZoneInfoNotFoundError, ValueError) as e:
    raise ValidationError(f"Unknown timezone: {timezone}") from e
  return await weather_forecast(redis, lat, lon, tz, now=utc_now(), days=days, hours=hours)
