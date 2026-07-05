from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.get_klarna_transactions_v1_klarna_transactions_get_response_get_klarna_transactions_v1_klarna_transactions_get import (
  GetKlarnaTransactionsV1KlarnaTransactionsGetResponseGetKlarnaTransactionsV1KlarnaTransactionsGet,
)
from ...models.http_validation_error import HTTPValidationError
from ...types import UNSET, Response, Unset


def _get_kwargs(
  *,
  authorization: str,
  cookie: None | str | Unset = UNSET,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}
  headers["authorization"] = authorization

  if not isinstance(cookie, Unset):
    headers["cookie"] = cookie

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/klarna/transactions",
  }

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(
  *, client: AuthenticatedClient | Client, response: httpx.Response
) -> GetKlarnaTransactionsV1KlarnaTransactionsGetResponseGetKlarnaTransactionsV1KlarnaTransactionsGet | HTTPValidationError | None:
  if response.status_code == 200:
    response_200 = GetKlarnaTransactionsV1KlarnaTransactionsGetResponseGetKlarnaTransactionsV1KlarnaTransactionsGet.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(
  *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[GetKlarnaTransactionsV1KlarnaTransactionsGetResponseGetKlarnaTransactionsV1KlarnaTransactionsGet | HTTPValidationError]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient,
  authorization: str,
  cookie: None | str | Unset = UNSET,
) -> Response[GetKlarnaTransactionsV1KlarnaTransactionsGetResponseGetKlarnaTransactionsV1KlarnaTransactionsGet | HTTPValidationError]:
  """Get Klarna Transactions

   Fetch Klarna transactions and return raw GraphQL response.

  Args:
      authorization (str): Klarna Bearer token
      cookie (None | str | Unset): Klarna session cookies

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[GetKlarnaTransactionsV1KlarnaTransactionsGetResponseGetKlarnaTransactionsV1KlarnaTransactionsGet | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    authorization=authorization,
    cookie=cookie,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  *,
  client: AuthenticatedClient,
  authorization: str,
  cookie: None | str | Unset = UNSET,
) -> GetKlarnaTransactionsV1KlarnaTransactionsGetResponseGetKlarnaTransactionsV1KlarnaTransactionsGet | HTTPValidationError | None:
  """Get Klarna Transactions

   Fetch Klarna transactions and return raw GraphQL response.

  Args:
      authorization (str): Klarna Bearer token
      cookie (None | str | Unset): Klarna session cookies

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      GetKlarnaTransactionsV1KlarnaTransactionsGetResponseGetKlarnaTransactionsV1KlarnaTransactionsGet | HTTPValidationError
  """

  return sync_detailed(
    client=client,
    authorization=authorization,
    cookie=cookie,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  authorization: str,
  cookie: None | str | Unset = UNSET,
) -> Response[GetKlarnaTransactionsV1KlarnaTransactionsGetResponseGetKlarnaTransactionsV1KlarnaTransactionsGet | HTTPValidationError]:
  """Get Klarna Transactions

   Fetch Klarna transactions and return raw GraphQL response.

  Args:
      authorization (str): Klarna Bearer token
      cookie (None | str | Unset): Klarna session cookies

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[GetKlarnaTransactionsV1KlarnaTransactionsGetResponseGetKlarnaTransactionsV1KlarnaTransactionsGet | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    authorization=authorization,
    cookie=cookie,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  authorization: str,
  cookie: None | str | Unset = UNSET,
) -> GetKlarnaTransactionsV1KlarnaTransactionsGetResponseGetKlarnaTransactionsV1KlarnaTransactionsGet | HTTPValidationError | None:
  """Get Klarna Transactions

   Fetch Klarna transactions and return raw GraphQL response.

  Args:
      authorization (str): Klarna Bearer token
      cookie (None | str | Unset): Klarna session cookies

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      GetKlarnaTransactionsV1KlarnaTransactionsGetResponseGetKlarnaTransactionsV1KlarnaTransactionsGet | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      client=client,
      authorization=authorization,
      cookie=cookie,
    )
  ).parsed
