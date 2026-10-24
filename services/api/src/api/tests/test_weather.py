from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from email.utils import format_datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import pytest
import pytest_asyncio
from api.app import app as api_app
from api.mcp.tools import weather as weather_tool
from api.models.user import User
from api.postgres import AsyncSession
from api.redis import Redis, create_redis, get_redis
from api.tests.fixtures.mcp import ConnectFixture, mcp_call, mcp_call_error
from api.weather import endpoints, places, yr
from api.weather.service import condition, summarize
from httpx import AsyncClient

# Stockholm is UTC+1 in November, so 09:30Z is 10:30 local.
NOW = datetime(2026, 11, 10, 9, 30, tzinfo=UTC)
HOURLY_FROM = datetime(2026, 11, 10, 9, tzinfo=UTC)


def _entry(at: datetime, temperature: float, *, one: dict[str, Any] | None = None, six: dict[str, Any] | None = None) -> dict[str, Any]:
  data: dict[str, Any] = {
    "instant": {
      "details": {
        "air_temperature": temperature,
        "apparent_air_temperature": temperature - 2,
        "wind_speed": 3.0,
        "wind_speed_of_gust": 6.0,
        "wind_from_direction": 225.0,
        "relative_humidity": 80.0,
      }
    }
  }
  if one is not None:
    data["next_1_hours"] = {
      "summary": {"symbol_code": one["symbol"]},
      "details": {"precipitation_amount": one["mm"], "probability_of_precipitation": one["pop"], "probability_of_thunder": one["thunder"]},
    }
  if six is not None:
    data["next_6_hours"] = {
      "summary": {"symbol_code": six["symbol"]},
      "details": {
        "precipitation_amount": six["mm"],
        "probability_of_precipitation": six["pop"],
        "air_temperature_min": six["min"],
        "air_temperature_max": six["max"],
      },
    }
  return {"time": at.strftime("%Y-%m-%dT%H:%M:%SZ"), "data": data}


def _forecast() -> dict[str, Any]:
  """Hourly from 10:00 on 10 Nov to 23:00 on 11 Nov (local), six-hourly through 12 Nov, then one bare instant."""
  series = []
  for hour in range(38):
    at = HOURLY_FROM + timedelta(hours=hour)
    on_11th = hour >= 14
    temperature = {20: -1.5, 30: 6.5}.get(hour, 3.0)
    one = {
      "symbol": "lightrainshowers_day" if on_11th else "partlycloudy_day",
      "mm": 0.5 if on_11th else 0.0,
      "pop": 80.0 if hour == 25 else 40.0,
      "thunder": 12.0 if hour == 27 else 5.0,
    }
    # The six-hour block repeats over the hourly entries; its amounts must not be added on top.
    six = {"symbol": "rain" if on_11th else "cloudy", "mm": 9.9, "pop": 10.0, "min": 0.0, "max": 5.0}
    series.append(_entry(at, temperature, one=one, six=six))
  for block in range(4):
    at = datetime(2026, 11, 11, 23, tzinfo=UTC) + timedelta(hours=6 * block)
    six = {"symbol": "heavysnow" if block == 2 else "cloudy", "mm": 2.0, "pop": 70.0 if block == 1 else 30.0, "min": -4.0 if block == 0 else -1.0, "max": 1.0}
    series.append(_entry(at, 0.0, six=six))
  series.append(_entry(datetime(2026, 11, 12, 23, tzinfo=UTC), 0.0))
  return {"type": "Feature", "properties": {"meta": {"updated_at": "2026-11-10T08:12:00Z"}, "timeseries": series}}


@dataclass
class FakeYr:
  status: int = 200
  last_modified: str = "Tue, 10 Nov 2026 08:12:00 GMT"
  expires_in: timedelta = timedelta(minutes=30)
  requests: list[httpx.Request] = field(default_factory=list)

  def handle(self, request: httpx.Request) -> httpx.Response:
    self.requests.append(request)
    if self.status != 200:
      return httpx.Response(self.status)
    headers = {"Expires": format_datetime(NOW + self.expires_in, usegmt=True), "Last-Modified": self.last_modified}
    if request.headers.get("If-Modified-Since") == self.last_modified:
      return httpx.Response(304, headers=headers)
    return httpx.Response(200, json=_forecast(), headers=headers)


@dataclass
class FakeNominatim:
  places: dict[str, dict[str, Any]] = field(default_factory=dict)
  requests: list[httpx.Request] = field(default_factory=list)

  def handle(self, request: httpx.Request) -> httpx.Response:
    self.requests.append(request)
    found = self.places.get(request.url.params["q"].casefold())
    return httpx.Response(200, json=[found] if found else [])


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> dict[str, datetime]:
  now = {"value": NOW}
  for module in (yr, weather_tool, endpoints):
    monkeypatch.setattr(module, "utc_now", lambda: now["value"])
  return now


@pytest.fixture
def met(monkeypatch: pytest.MonkeyPatch) -> FakeYr:
  fake = FakeYr()
  monkeypatch.setattr(yr, "transport", httpx.MockTransport(fake.handle))
  return fake


@pytest.fixture
def nominatim(monkeypatch: pytest.MonkeyPatch) -> FakeNominatim:
  fake = FakeNominatim(
    places={
      "västerås": {"name": "Västerås", "lat": "59.6099", "lon": "16.5448", "address": {"state": "Västmanlands län", "country": "Sverige"}},
    }
  )
  monkeypatch.setattr(places, "transport", httpx.MockTransport(fake.handle))
  return fake


@pytest_asyncio.fixture(autouse=True)
async def redis() -> AsyncIterator[Redis]:
  client = create_redis("script")

  async def clear() -> None:
    for pattern in ("yr:*", "nominatim:*"):
      async for key in client.scan_iter(pattern):
        await client.delete(key)

  await clear()
  api_app.dependency_overrides[get_redis] = lambda: client
  yield client
  api_app.dependency_overrides.pop(get_redis)
  await clear()
  await client.aclose()


@pytest_asyncio.fixture(autouse=True)
async def timezones(session: AsyncSession, user: User, other_user: User) -> None:
  user.timezone, other_user.timezone = "Europe/Stockholm", "America/New_York"
  await session.flush()


class TestCondition:
  @pytest.mark.parametrize(
    ("symbol", "words"),
    [
      ("clearsky_day", "Clear sky"),
      ("partlycloudy_night", "Partly cloudy"),
      ("fog", "Fog"),
      ("rain", "Rain"),
      ("lightrainshowers_polartwilight", "Light rain showers"),
      ("heavysnowshowersandthunder_day", "Heavy snow showers and thunder"),
      ("lightssleetshowersandthunder_night", "Light sleet showers and thunder"),
      (None, None),
    ],
  )
  def test_yr_symbols_read_as_words(self, symbol: str | None, words: str | None) -> None:
    assert condition(symbol) == words


class TestDailyPrecipitation:
  def test_hours_inside_a_six_hour_block_already_counted_are_not_added_again(self) -> None:
    day = datetime(2026, 11, 10, tzinfo=UTC)
    six = {"symbol": "rain", "mm": 2.0, "pop": 50.0, "min": 1.0, "max": 2.0}
    hourly = {"symbol": "rain", "mm": 0.5, "pop": 50.0, "thunder": 0.0}
    series = [
      _entry(day, 1.0, six=six),
      *(_entry(day + timedelta(hours=h), 1.0, one=hourly) for h in range(1, 6)),
      _entry(day + timedelta(hours=6), 1.0, six=six),
      _entry(day + timedelta(hours=12), 1.0, one=hourly),
    ]
    forecast = {"properties": {"meta": {"updated_at": "2026-11-10T00:00:00Z"}, "timeseries": series}}

    [only] = summarize(forecast, ZoneInfo("UTC"), now=day, days=1, hours=0, location=None, latitude=0, longitude=0).days

    assert only.precipitation == 4.5


@pytest.mark.usefixtures("clock")
class TestForecast:
  @pytest.mark.asyncio
  async def test_now_the_next_hours_and_each_day_in_the_users_timezone(self, connect: ConnectFixture, met: FakeYr) -> None:
    forecast = await mcp_call(connect, "get_weather", {"latitude": 59.6099, "longitude": 16.5448, "hours": 3})

    assert (forecast["timezone"], forecast["latitude"], forecast["location"], forecast["updated_at"]) == (
      "Europe/Stockholm",
      59.6099,
      None,
      "2026-11-10T08:12:00Z",
    )
    assert forecast["now"] == {
      "time": "2026-11-10T10:00:00+01:00",
      "temperature": 3.0,
      "feels_like": 1.0,
      "condition": "Partly cloudy",
      "precipitation_next_hour": 0.0,
      "wind_speed": 3.0,
      "wind_gust": 6.0,
      "wind_from_direction": 225.0,
      "humidity": 80.0,
    }
    assert [h["time"] for h in forecast["hours"]] == ["2026-11-10T10:00:00+01:00", "2026-11-10T11:00:00+01:00", "2026-11-10T12:00:00+01:00"]
    assert forecast["days"] == [
      {
        "date": "2026-11-10",
        "temperature_min": 0.0,
        "temperature_max": 5.0,
        "condition": "Cloudy",
        "precipitation": 0.0,
        "precipitation_probability_max": 40.0,
        "thunder_probability_max": 5.0,
        "wind_speed_max": 3.0,
        "wind_gust_max": 6.0,
      },
      {
        "date": "2026-11-11",
        "temperature_min": -1.5,
        "temperature_max": 6.5,
        "condition": "Rain",
        "precipitation": 12.0,
        "precipitation_probability_max": 80.0,
        "thunder_probability_max": 12.0,
        "wind_speed_max": 3.0,
        "wind_gust_max": 6.0,
      },
      {
        "date": "2026-11-12",
        "temperature_min": -4.0,
        "temperature_max": 1.0,
        "condition": "Heavy snow",
        "precipitation": 8.0,
        "precipitation_probability_max": 70.0,
        "thunder_probability_max": None,
        "wind_speed_max": 3.0,
        "wind_gust_max": 6.0,
      },
    ]
    assert "MET Norway" in forecast["attribution"]

  @pytest.mark.asyncio
  async def test_each_caller_gets_days_and_times_in_their_own_timezone(self, connect: ConnectFixture, met: FakeYr) -> None:
    args = {"latitude": 59.61, "longitude": 16.54, "days": 1, "hours": 1}

    mine = await mcp_call(connect, "get_weather", args)
    theirs = await mcp_call(connect, "get_weather", args, token="token-b")

    assert (mine["timezone"], mine["now"]["time"], mine["days"][0]["date"]) == ("Europe/Stockholm", "2026-11-10T10:00:00+01:00", "2026-11-10")
    assert (theirs["timezone"], theirs["now"]["time"], theirs["days"][0]["date"]) == ("America/New_York", "2026-11-10T04:00:00-05:00", "2026-11-10")

  @pytest.mark.asyncio
  async def test_the_rest_api_serves_the_same_forecast(self, client: AsyncClient, met: FakeYr) -> None:
    response = await client.get("/v1/weather", params={"lat": 59.61, "lon": 16.54, "days": 2, "hours": 0, "timezone": "Europe/Stockholm"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert ([d["date"] for d in body["days"]], body["hours"]) == (["2026-11-10", "2026-11-11"], [])
    assert (await client.get("/v1/weather", params={"lat": 59.61, "lon": 16.54, "timezone": "Mars/Olympus"})).status_code == 400


@pytest.mark.usefixtures("clock")
class TestYrTerms:
  @pytest.mark.asyncio
  async def test_names_the_app_and_sends_coordinates_rounded(self, connect: ConnectFixture, met: FakeYr) -> None:
    await mcp_call(connect, "get_weather", {"latitude": 59.609912, "longitude": 16.544833})

    [request] = met.requests
    assert request.headers["User-Agent"] == "Bessel/1.0 (+https://getbessel.com)"
    assert (request.url.path, dict(request.url.params)) == ("/weatherapi/locationforecast/2.0/complete", {"lat": "59.61", "lon": "16.54"})

  @pytest.mark.asyncio
  async def test_asks_again_only_after_expiry_and_then_only_if_modified(self, connect: ConnectFixture, met: FakeYr, clock: dict[str, datetime]) -> None:
    args = {"latitude": 59.61, "longitude": 16.54, "days": 1}

    await mcp_call(connect, "get_weather", args)
    await mcp_call(connect, "get_weather", {**args, "latitude": 59.6111})
    assert len(met.requests) == 1

    clock["value"] = NOW + timedelta(minutes=31)
    again = await mcp_call(connect, "get_weather", args)

    assert len(met.requests) == 2
    assert met.requests[1].headers["If-Modified-Since"] == "Tue, 10 Nov 2026 08:12:00 GMT"
    assert again["updated_at"] == "2026-11-10T08:12:00Z"

  @pytest.mark.asyncio
  async def test_an_outage_is_a_clear_error(self, connect: ConnectFixture, client: AsyncClient, met: FakeYr) -> None:
    met.status = 500

    message = await mcp_call_error(connect, "get_weather", {"latitude": 59.61, "longitude": 16.54})

    assert message == yr.UNAVAILABLE
    assert (await client.get("/v1/weather", params={"lat": 59.61, "lon": 16.54})).status_code == 503


@pytest.mark.usefixtures("clock")
class TestPlaces:
  @pytest.mark.asyncio
  async def test_a_place_name_is_looked_up_once_and_named_in_the_answer(self, connect: ConnectFixture, met: FakeYr, nominatim: FakeNominatim) -> None:
    first = await mcp_call(connect, "get_weather", {"place": "Västerås", "days": 1})
    second = await mcp_call(connect, "get_weather", {"place": "västerås ", "days": 1})

    assert (first["location"], first["latitude"], first["longitude"]) == ("Västerås, Västmanlands län, Sverige", 59.6099, 16.5448)
    assert second["location"] == first["location"]
    assert len(nominatim.requests) == 1
    assert nominatim.requests[0].headers["User-Agent"] == yr.USER_AGENT
    assert dict(met.requests[0].url.params) == {"lat": "59.61", "lon": "16.54"}

  @pytest.mark.asyncio
  async def test_an_unknown_place_or_no_place_says_what_to_give(self, connect: ConnectFixture, met: FakeYr, nominatim: FakeNominatim) -> None:
    assert await mcp_call_error(connect, "get_weather", {"place": "Atlantis"}) == (
      "Couldn't find a place called 'Atlantis'. Try adding the country, or give coordinates."
    )
    assert await mcp_call_error(connect, "get_weather", {"latitude": 59.61}) == "Give a place name, or both latitude and longitude."
    assert met.requests == []
