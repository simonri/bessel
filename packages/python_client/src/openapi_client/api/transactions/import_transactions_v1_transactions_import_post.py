from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.body_import_transactions_v1_transactions_import_post import BodyImportTransactionsV1TransactionsImportPost
from ...models.http_validation_error import HTTPValidationError
from ...models.import_response import ImportResponse
from ...types import UNSET, Response


def _get_kwargs(
  *,
  body: BodyImportTransactionsV1TransactionsImportPost,
  bank: str,
  bank_account_id: UUID,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  params: dict[str, Any] = {}

  params["bank"] = bank

  json_bank_account_id = str(bank_account_id)
  params["bank_account_id"] = json_bank_account_id

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "post",
    "url": "/v1/transactions/import",
    "params": params,
  }

  _kwargs["files"] = body.to_multipart()

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | ImportResponse | None:
  if response.status_code == 200:
    response_200 = ImportResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | ImportResponse]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient | Client,
  body: BodyImportTransactionsV1TransactionsImportPost,
  bank: str,
  bank_account_id: UUID,
) -> Response[HTTPValidationError | ImportResponse]:
  """Import Transactions

   Import transactions from a bank export (CSV or XLSX).

  Duplicate transactions (by dedup hash) are automatically skipped.

  Args:
      bank (str): Bank identifier, e.g. 'marginalen'.
      bank_account_id (UUID): Bank account to attach transactions to.
      body (BodyImportTransactionsV1TransactionsImportPost):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | ImportResponse]
  """

  kwargs = _get_kwargs(
    body=body,
    bank=bank,
    bank_account_id=bank_account_id,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  *,
  client: AuthenticatedClient | Client,
  body: BodyImportTransactionsV1TransactionsImportPost,
  bank: str,
  bank_account_id: UUID,
) -> HTTPValidationError | ImportResponse | None:
  """Import Transactions

   Import transactions from a bank export (CSV or XLSX).

  Duplicate transactions (by dedup hash) are automatically skipped.

  Args:
      bank (str): Bank identifier, e.g. 'marginalen'.
      bank_account_id (UUID): Bank account to attach transactions to.
      body (BodyImportTransactionsV1TransactionsImportPost):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | ImportResponse
  """

  return sync_detailed(
    client=client,
    body=body,
    bank=bank,
    bank_account_id=bank_account_id,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient | Client,
  body: BodyImportTransactionsV1TransactionsImportPost,
  bank: str,
  bank_account_id: UUID,
) -> Response[HTTPValidationError | ImportResponse]:
  """Import Transactions

   Import transactions from a bank export (CSV or XLSX).

  Duplicate transactions (by dedup hash) are automatically skipped.

  Args:
      bank (str): Bank identifier, e.g. 'marginalen'.
      bank_account_id (UUID): Bank account to attach transactions to.
      body (BodyImportTransactionsV1TransactionsImportPost):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | ImportResponse]
  """

  kwargs = _get_kwargs(
    body=body,
    bank=bank,
    bank_account_id=bank_account_id,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient | Client,
  body: BodyImportTransactionsV1TransactionsImportPost,
  bank: str,
  bank_account_id: UUID,
) -> HTTPValidationError | ImportResponse | None:
  """Import Transactions

   Import transactions from a bank export (CSV or XLSX).

  Duplicate transactions (by dedup hash) are automatically skipped.

  Args:
      bank (str): Bank identifier, e.g. 'marginalen'.
      bank_account_id (UUID): Bank account to attach transactions to.
      body (BodyImportTransactionsV1TransactionsImportPost):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | ImportResponse
  """

  return (
    await asyncio_detailed(
      client=client,
      body=body,
      bank=bank,
      bank_account_id=bank_account_id,
    )
  ).parsed
