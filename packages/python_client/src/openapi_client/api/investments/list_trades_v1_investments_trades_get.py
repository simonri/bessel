from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.trade_list_response import TradeListResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
  *,
  security_id: None | Unset | UUID = UNSET,
  bank_account_id: None | Unset | UUID = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  json_security_id: None | str | Unset
  if isinstance(security_id, Unset):
    json_security_id = UNSET
  elif isinstance(security_id, UUID):
    json_security_id = str(security_id)
  else:
    json_security_id = security_id
  params["security_id"] = json_security_id

  json_bank_account_id: None | str | Unset
  if isinstance(bank_account_id, Unset):
    json_bank_account_id = UNSET
  elif isinstance(bank_account_id, UUID):
    json_bank_account_id = str(bank_account_id)
  else:
    json_bank_account_id = bank_account_id
  params["bank_account_id"] = json_bank_account_id

  params["page"] = page

  params["limit"] = limit

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/investments/trades",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | TradeListResponse | None:
  if response.status_code == 200:
    response_200 = TradeListResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | TradeListResponse]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient | Client,
  security_id: None | Unset | UUID = UNSET,
  bank_account_id: None | Unset | UUID = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> Response[HTTPValidationError | TradeListResponse]:
  """List Trades

  Args:
      security_id (None | Unset | UUID):
      bank_account_id (None | Unset | UUID):
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TradeListResponse]
  """

  kwargs = _get_kwargs(
    security_id=security_id,
    bank_account_id=bank_account_id,
    page=page,
    limit=limit,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  *,
  client: AuthenticatedClient | Client,
  security_id: None | Unset | UUID = UNSET,
  bank_account_id: None | Unset | UUID = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> HTTPValidationError | TradeListResponse | None:
  """List Trades

  Args:
      security_id (None | Unset | UUID):
      bank_account_id (None | Unset | UUID):
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TradeListResponse
  """

  return sync_detailed(
    client=client,
    security_id=security_id,
    bank_account_id=bank_account_id,
    page=page,
    limit=limit,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient | Client,
  security_id: None | Unset | UUID = UNSET,
  bank_account_id: None | Unset | UUID = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> Response[HTTPValidationError | TradeListResponse]:
  """List Trades

  Args:
      security_id (None | Unset | UUID):
      bank_account_id (None | Unset | UUID):
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TradeListResponse]
  """

  kwargs = _get_kwargs(
    security_id=security_id,
    bank_account_id=bank_account_id,
    page=page,
    limit=limit,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient | Client,
  security_id: None | Unset | UUID = UNSET,
  bank_account_id: None | Unset | UUID = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> HTTPValidationError | TradeListResponse | None:
  """List Trades

  Args:
      security_id (None | Unset | UUID):
      bank_account_id (None | Unset | UUID):
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TradeListResponse
  """

  return (
    await asyncio_detailed(
      client=client,
      security_id=security_id,
      bank_account_id=bank_account_id,
      page=page,
      limit=limit,
    )
  ).parsed
