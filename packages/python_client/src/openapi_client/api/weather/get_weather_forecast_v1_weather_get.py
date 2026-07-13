from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.weather_forecast_response import WeatherForecastResponse
from ...types import UNSET, Response


def _get_kwargs(
  *,
  lat: float,
  lon: float,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  params["lat"] = lat

  params["lon"] = lon

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/weather",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | WeatherForecastResponse | None:
  if response.status_code == 200:
    response_200 = WeatherForecastResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | WeatherForecastResponse]:
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
) -> Response[HTTPValidationError | WeatherForecastResponse]:
  """Get Weather Forecast

  Args:
      lat (float): Latitude.
      lon (float): Longitude.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | WeatherForecastResponse]
  """

  kwargs = _get_kwargs(
    lat=lat,
    lon=lon,
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
) -> HTTPValidationError | WeatherForecastResponse | None:
  """Get Weather Forecast

  Args:
      lat (float): Latitude.
      lon (float): Longitude.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | WeatherForecastResponse
  """

  return sync_detailed(
    client=client,
    lat=lat,
    lon=lon,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  lat: float,
  lon: float,
) -> Response[HTTPValidationError | WeatherForecastResponse]:
  """Get Weather Forecast

  Args:
      lat (float): Latitude.
      lon (float): Longitude.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | WeatherForecastResponse]
  """

  kwargs = _get_kwargs(
    lat=lat,
    lon=lon,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  lat: float,
  lon: float,
) -> HTTPValidationError | WeatherForecastResponse | None:
  """Get Weather Forecast

  Args:
      lat (float): Latitude.
      lon (float): Longitude.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | WeatherForecastResponse
  """

  return (
    await asyncio_detailed(
      client=client,
      lat=lat,
      lon=lon,
    )
  ).parsed
