from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.bank_account_schema import BankAccountSchema
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
  bank_account_id: UUID,
) -> dict[str, Any]:

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/bank-accounts/{bank_account_id}".format(
      bank_account_id=quote(str(bank_account_id), safe=""),
    ),
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> BankAccountSchema | HTTPValidationError | None:
  if response.status_code == 200:
    response_200 = BankAccountSchema.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[BankAccountSchema | HTTPValidationError]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  bank_account_id: UUID,
  *,
  client: AuthenticatedClient | Client,
) -> Response[BankAccountSchema | HTTPValidationError]:
  """Get Bank Account

   Get a bank account by ID.

  Args:
      bank_account_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[BankAccountSchema | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    bank_account_id=bank_account_id,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  bank_account_id: UUID,
  *,
  client: AuthenticatedClient | Client,
) -> BankAccountSchema | HTTPValidationError | None:
  """Get Bank Account

   Get a bank account by ID.

  Args:
      bank_account_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      BankAccountSchema | HTTPValidationError
  """

  return sync_detailed(
    bank_account_id=bank_account_id,
    client=client,
  ).parsed


async def asyncio_detailed(
  bank_account_id: UUID,
  *,
  client: AuthenticatedClient | Client,
) -> Response[BankAccountSchema | HTTPValidationError]:
  """Get Bank Account

   Get a bank account by ID.

  Args:
      bank_account_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[BankAccountSchema | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    bank_account_id=bank_account_id,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  bank_account_id: UUID,
  *,
  client: AuthenticatedClient | Client,
) -> BankAccountSchema | HTTPValidationError | None:
  """Get Bank Account

   Get a bank account by ID.

  Args:
      bank_account_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      BankAccountSchema | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      bank_account_id=bank_account_id,
      client=client,
    )
  ).parsed
