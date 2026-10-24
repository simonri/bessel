from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.weather_forecast import WeatherForecast
from ...types import UNSET, Response, Unset


def _get_kwargs(
  *,
  lat: float,
  lon: float,
  days: int | Unset = 9,
  hours: int | Unset = 24,
  timezone: None | str | Unset = UNSET,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  params["lat"] = lat

  params["lon"] = lon

  params["days"] = days

  params["hours"] = hours

  json_timezone: None | str | Unset
  if isinstance(timezone, Unset):
    json_timezone = UNSET
  else:
    json_timezone = timezone
  params["timezone"] = json_timezone

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/weather",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | WeatherForecast | None:
  if response.status_code == 200:
    response_200 = WeatherForecast.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | WeatherForecast]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient,
  lat: float,
  lon: float,
  days: int | Unset = 9,
  hours: int | Unset = 24,
  timezone: None | str | Unset = UNSET,
) -> Response[HTTPValidationError | WeatherForecast]:
  """Get Weather Forecast

   Yr's forecast for a point: the weather now, the next hours and day by day.

  Args:
      lat (float): Latitude.
      lon (float): Longitude.
      days (int | Unset): How many days, starting today. Default: 9.
      hours (int | Unset): How many of the next hours, one by one. Default: 24.
      timezone (None | str | Unset): IANA zone the days and times are in; defaults to the user's
          own.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | WeatherForecast]
  """

  kwargs = _get_kwargs(
    lat=lat,
    lon=lon,
    days=days,
    hours=hours,
    timezone=timezone,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  *,
  client: AuthenticatedClient,
  lat: float,
  lon: float,
  days: int | Unset = 9,
  hours: int | Unset = 24,
  timezone: None | str | Unset = UNSET,
) -> HTTPValidationError | WeatherForecast | None:
  """Get Weather Forecast

   Yr's forecast for a point: the weather now, the next hours and day by day.

  Args:
      lat (float): Latitude.
      lon (float): Longitude.
      days (int | Unset): How many days, starting today. Default: 9.
      hours (int | Unset): How many of the next hours, one by one. Default: 24.
      timezone (None | str | Unset): IANA zone the days and times are in; defaults to the user's
          own.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | WeatherForecast
  """

  return sync_detailed(
    client=client,
    lat=lat,
    lon=lon,
    days=days,
    hours=hours,
    timezone=timezone,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  lat: float,
  lon: float,
  days: int | Unset = 9,
  hours: int | Unset = 24,
  timezone: None | str | Unset = UNSET,
) -> Response[HTTPValidationError | WeatherForecast]:
  """Get Weather Forecast

   Yr's forecast for a point: the weather now, the next hours and day by day.

  Args:
      lat (float): Latitude.
      lon (float): Longitude.
      days (int | Unset): How many days, starting today. Default: 9.
      hours (int | Unset): How many of the next hours, one by one. Default: 24.
      timezone (None | str | Unset): IANA zone the days and times are in; defaults to the user's
          own.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | WeatherForecast]
  """

  kwargs = _get_kwargs(
    lat=lat,
    lon=lon,
    days=days,
    hours=hours,
    timezone=timezone,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  lat: float,
  lon: float,
  days: int | Unset = 9,
  hours: int | Unset = 24,
  timezone: None | str | Unset = UNSET,
) -> HTTPValidationError | WeatherForecast | None:
  """Get Weather Forecast

   Yr's forecast for a point: the weather now, the next hours and day by day.

  Args:
      lat (float): Latitude.
      lon (float): Longitude.
      days (int | Unset): How many days, starting today. Default: 9.
      hours (int | Unset): How many of the next hours, one by one. Default: 24.
      timezone (None | str | Unset): IANA zone the days and times are in; defaults to the user's
          own.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | WeatherForecast
  """

  return (
    await asyncio_detailed(
      client=client,
      lat=lat,
      lon=lon,
      days=days,
      hours=hours,
      timezone=timezone,
    )
  ).parsed
