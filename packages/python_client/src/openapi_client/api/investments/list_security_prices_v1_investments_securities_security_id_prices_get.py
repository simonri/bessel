from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.security_price_list_response import SecurityPriceListResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
  security_id: UUID,
  *,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  params["page"] = page

  params["limit"] = limit

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/investments/securities/{security_id}/prices".format(
      security_id=quote(str(security_id), safe=""),
    ),
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | SecurityPriceListResponse | None:
  if response.status_code == 200:
    response_200 = SecurityPriceListResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | SecurityPriceListResponse]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  security_id: UUID,
  *,
  client: AuthenticatedClient,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> Response[HTTPValidationError | SecurityPriceListResponse]:
  """List Security Prices

  Args:
      security_id (UUID):
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | SecurityPriceListResponse]
  """

  kwargs = _get_kwargs(
    security_id=security_id,
    page=page,
    limit=limit,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  security_id: UUID,
  *,
  client: AuthenticatedClient,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> HTTPValidationError | SecurityPriceListResponse | None:
  """List Security Prices

  Args:
      security_id (UUID):
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | SecurityPriceListResponse
  """

  return sync_detailed(
    security_id=security_id,
    client=client,
    page=page,
    limit=limit,
  ).parsed


async def asyncio_detailed(
  security_id: UUID,
  *,
  client: AuthenticatedClient,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> Response[HTTPValidationError | SecurityPriceListResponse]:
  """List Security Prices

  Args:
      security_id (UUID):
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | SecurityPriceListResponse]
  """

  kwargs = _get_kwargs(
    security_id=security_id,
    page=page,
    limit=limit,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  security_id: UUID,
  *,
  client: AuthenticatedClient,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> HTTPValidationError | SecurityPriceListResponse | None:
  """List Security Prices

  Args:
      security_id (UUID):
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | SecurityPriceListResponse
  """

  return (
    await asyncio_detailed(
      security_id=security_id,
      client=client,
      page=page,
      limit=limit,
    )
  ).parsed
