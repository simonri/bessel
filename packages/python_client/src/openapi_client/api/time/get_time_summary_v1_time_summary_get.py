from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.time_summary_schema import TimeSummarySchema
from ...types import UNSET, Response


def _get_kwargs(
  *,
  year: int,
  tz_name: str,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  params["year"] = year

  params["tz_name"] = tz_name

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/time/summary",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | TimeSummarySchema | None:
  if response.status_code == 200:
    response_200 = TimeSummarySchema.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | TimeSummarySchema]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient,
  year: int,
  tz_name: str,
) -> Response[HTTPValidationError | TimeSummarySchema]:
  """Get Monthly Time Totals

  Args:
      year (int):
      tz_name (str): IANA timezone the months are counted in.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TimeSummarySchema]
  """

  kwargs = _get_kwargs(
    year=year,
    tz_name=tz_name,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  *,
  client: AuthenticatedClient,
  year: int,
  tz_name: str,
) -> HTTPValidationError | TimeSummarySchema | None:
  """Get Monthly Time Totals

  Args:
      year (int):
      tz_name (str): IANA timezone the months are counted in.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TimeSummarySchema
  """

  return sync_detailed(
    client=client,
    year=year,
    tz_name=tz_name,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  year: int,
  tz_name: str,
) -> Response[HTTPValidationError | TimeSummarySchema]:
  """Get Monthly Time Totals

  Args:
      year (int):
      tz_name (str): IANA timezone the months are counted in.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TimeSummarySchema]
  """

  kwargs = _get_kwargs(
    year=year,
    tz_name=tz_name,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  year: int,
  tz_name: str,
) -> HTTPValidationError | TimeSummarySchema | None:
  """Get Monthly Time Totals

  Args:
      year (int):
      tz_name (str): IANA timezone the months are counted in.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TimeSummarySchema
  """

  return (
    await asyncio_detailed(
      client=client,
      year=year,
      tz_name=tz_name,
    )
  ).parsed
