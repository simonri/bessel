from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.transaction_summary_response import TransactionSummaryResponse
from ...types import UNSET, Response


def _get_kwargs(
  *,
  year: int,
  month: int,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  params["year"] = year

  params["month"] = month

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/transactions/summary",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | TransactionSummaryResponse | None:
  if response.status_code == 200:
    response_200 = TransactionSummaryResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | TransactionSummaryResponse]:
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
  month: int,
) -> Response[HTTPValidationError | TransactionSummaryResponse]:
  """Month Summary

   The user's own income and spending for a month, with the year before it for comparison.

  Args:
      year (int): Year to summarize.
      month (int): Month to summarize (1-12).

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TransactionSummaryResponse]
  """

  kwargs = _get_kwargs(
    year=year,
    month=month,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  *,
  client: AuthenticatedClient,
  year: int,
  month: int,
) -> HTTPValidationError | TransactionSummaryResponse | None:
  """Month Summary

   The user's own income and spending for a month, with the year before it for comparison.

  Args:
      year (int): Year to summarize.
      month (int): Month to summarize (1-12).

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TransactionSummaryResponse
  """

  return sync_detailed(
    client=client,
    year=year,
    month=month,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  year: int,
  month: int,
) -> Response[HTTPValidationError | TransactionSummaryResponse]:
  """Month Summary

   The user's own income and spending for a month, with the year before it for comparison.

  Args:
      year (int): Year to summarize.
      month (int): Month to summarize (1-12).

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TransactionSummaryResponse]
  """

  kwargs = _get_kwargs(
    year=year,
    month=month,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  year: int,
  month: int,
) -> HTTPValidationError | TransactionSummaryResponse | None:
  """Month Summary

   The user's own income and spending for a month, with the year before it for comparison.

  Args:
      year (int): Year to summarize.
      month (int): Month to summarize (1-12).

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TransactionSummaryResponse
  """

  return (
    await asyncio_detailed(
      client=client,
      year=year,
      month=month,
    )
  ).parsed
