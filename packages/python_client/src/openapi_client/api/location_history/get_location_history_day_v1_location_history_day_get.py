import datetime
from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.location_day import LocationDay
from ...types import UNSET, Response


def _get_kwargs(
  *,
  date: datetime.date,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  json_date = date.isoformat()
  params["date"] = json_date

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/location-history/day",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | LocationDay | None:
  if response.status_code == 200:
    response_200 = LocationDay.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | LocationDay]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient,
  date: datetime.date,
) -> Response[HTTPValidationError | LocationDay]:
  """Get Location History Day

  Args:
      date (datetime.date): Local date where the segments happened.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | LocationDay]
  """

  kwargs = _get_kwargs(
    date=date,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  *,
  client: AuthenticatedClient,
  date: datetime.date,
) -> HTTPValidationError | LocationDay | None:
  """Get Location History Day

  Args:
      date (datetime.date): Local date where the segments happened.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | LocationDay
  """

  return sync_detailed(
    client=client,
    date=date,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  date: datetime.date,
) -> Response[HTTPValidationError | LocationDay]:
  """Get Location History Day

  Args:
      date (datetime.date): Local date where the segments happened.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | LocationDay]
  """

  kwargs = _get_kwargs(
    date=date,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  date: datetime.date,
) -> HTTPValidationError | LocationDay | None:
  """Get Location History Day

  Args:
      date (datetime.date): Local date where the segments happened.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | LocationDay
  """

  return (
    await asyncio_detailed(
      client=client,
      date=date,
    )
  ).parsed
