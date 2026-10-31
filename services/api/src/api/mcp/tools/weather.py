from typing import Annotated

from mcp.server.mcpserver import Context
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field

from api.common.utils import utc_now
from api.exceptions import ServiceUnavailableError
from api.mcp.context import request_redis, user_session
from api.mcp.dates import TimezoneParam, resolve_timezone
from api.mcp.tools.common import ToolSpec, read
from api.weather.places import find_place
from api.weather.schemas import WeatherForecast
from api.weather.service import MAX_DAYS, MAX_HOURS, weather_forecast


async def get_weather(
  ctx: Context,
  place: Annotated[str | None, Field(description="A place name, e.g. 'Västerås', 'Åre' or 'Barcelona, Spain'. Or give latitude and longitude.")] = None,
  latitude: Annotated[float | None, Field(ge=-90, le=90)] = None,
  longitude: Annotated[float | None, Field(ge=-180, le=180)] = None,
  days: Annotated[int, Field(ge=1, le=MAX_DAYS, description="How many days, starting today.")] = 3,
  hours: Annotated[int, Field(ge=0, le=MAX_HOURS, description="How many of the next hours, one by one.")] = 12,
  timezone: TimezoneParam = None,
) -> WeatherForecast:
  """Yr's weather forecast for a place: now, hour by hour, and day by day for up to nine days.

  Use it for "what's the weather tomorrow", "will it rain this afternoon", or before suggesting a run, a trip or
  an outdoor plan. Days and times are in the user's timezone. Credit the data as from Yr when showing it.
  """
  if place is None and (latitude is None or longitude is None):
    raise ToolError("Give a place name, or both latitude and longitude.")
  async with user_session(ctx) as (_, user):
    tz = resolve_timezone(user, timezone)
  redis = request_redis(ctx)
  try:
    location = None
    if latitude is None or longitude is None:
      assert place is not None
      found = await find_place(redis, place)
      if found is None:
        raise ToolError(f"Couldn't find a place called {place!r}. Try adding the country, or give coordinates.")
      location, latitude, longitude = found.name, found.latitude, found.longitude
    return await weather_forecast(redis, latitude, longitude, tz, now=utc_now(), days=days, hours=hours, location=location or place)
  except ServiceUnavailableError as e:
    raise ToolError(e.message) from e


TOOLS: list[ToolSpec] = [read(get_weather, "Weather", open_world=True)]
