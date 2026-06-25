from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.monthly_flow_response import MonthlyFlowResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
  *,
  months: int | Unset = 6,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  params["months"] = months

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/transactions/monthly-flow",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | MonthlyFlowResponse | None:
  if response.status_code == 200:
    response_200 = MonthlyFlowResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | MonthlyFlowResponse]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient,
  months: int | Unset = 6,
) -> Response[HTTPValidationError | MonthlyFlowResponse]:
  """Monthly Income & Expenses

   Return income and expenses aggregated per month.

  Args:
      months (int | Unset): Number of months to look back (including current). Default: 6.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | MonthlyFlowResponse]
  """

  kwargs = _get_kwargs(
    months=months,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  *,
  client: AuthenticatedClient,
  months: int | Unset = 6,
) -> HTTPValidationError | MonthlyFlowResponse | None:
  """Monthly Income & Expenses

   Return income and expenses aggregated per month.

  Args:
      months (int | Unset): Number of months to look back (including current). Default: 6.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | MonthlyFlowResponse
  """

  return sync_detailed(
    client=client,
    months=months,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  months: int | Unset = 6,
) -> Response[HTTPValidationError | MonthlyFlowResponse]:
  """Monthly Income & Expenses

   Return income and expenses aggregated per month.

  Args:
      months (int | Unset): Number of months to look back (including current). Default: 6.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | MonthlyFlowResponse]
  """

  kwargs = _get_kwargs(
    months=months,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  months: int | Unset = 6,
) -> HTTPValidationError | MonthlyFlowResponse | None:
  """Monthly Income & Expenses

   Return income and expenses aggregated per month.

  Args:
      months (int | Unset): Number of months to look back (including current). Default: 6.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | MonthlyFlowResponse
  """

  return (
    await asyncio_detailed(
      client=client,
      months=months,
    )
  ).parsed
