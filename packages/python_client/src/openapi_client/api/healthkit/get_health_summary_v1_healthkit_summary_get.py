import datetime
from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.health_summary_response import HealthSummaryResponse
from ...models.http_validation_error import HTTPValidationError
from ...types import UNSET, Response


def _get_kwargs(
  *,
  date: datetime.date,
  tz_name: str,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  json_date = date.isoformat()
  params["date"] = json_date

  params["tz_name"] = tz_name

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/healthkit/summary",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | HealthSummaryResponse | None:
  if response.status_code == 200:
    response_200 = HealthSummaryResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | HealthSummaryResponse]:
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
  tz_name: str,
) -> Response[HTTPValidationError | HealthSummaryResponse]:
  """Get Health Day Summary

  Args:
      date (datetime.date): Local date to summarize. Its sleep is the night that ended that
          morning.
      tz_name (str): IANA timezone name, e.g. 'Europe/Stockholm'.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | HealthSummaryResponse]
  """

  kwargs = _get_kwargs(
    date=date,
    tz_name=tz_name,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  *,
  client: AuthenticatedClient,
  date: datetime.date,
  tz_name: str,
) -> HTTPValidationError | HealthSummaryResponse | None:
  """Get Health Day Summary

  Args:
      date (datetime.date): Local date to summarize. Its sleep is the night that ended that
          morning.
      tz_name (str): IANA timezone name, e.g. 'Europe/Stockholm'.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | HealthSummaryResponse
  """

  return sync_detailed(
    client=client,
    date=date,
    tz_name=tz_name,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  date: datetime.date,
  tz_name: str,
) -> Response[HTTPValidationError | HealthSummaryResponse]:
  """Get Health Day Summary

  Args:
      date (datetime.date): Local date to summarize. Its sleep is the night that ended that
          morning.
      tz_name (str): IANA timezone name, e.g. 'Europe/Stockholm'.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | HealthSummaryResponse]
  """

  kwargs = _get_kwargs(
    date=date,
    tz_name=tz_name,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  date: datetime.date,
  tz_name: str,
) -> HTTPValidationError | HealthSummaryResponse | None:
  """Get Health Day Summary

  Args:
      date (datetime.date): Local date to summarize. Its sleep is the night that ended that
          morning.
      tz_name (str): IANA timezone name, e.g. 'Europe/Stockholm'.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | HealthSummaryResponse
  """

  return (
    await asyncio_detailed(
      client=client,
      date=date,
      tz_name=tz_name,
    )
  ).parsed
