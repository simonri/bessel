from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.transaction_schema import TransactionSchema
from ...models.transaction_update import TransactionUpdate
from ...types import Response


def _get_kwargs(
  transaction_id: UUID,
  *,
  body: TransactionUpdate,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "patch",
    "url": "/v1/transactions/{transaction_id}".format(
      transaction_id=quote(str(transaction_id), safe=""),
    ),
  }

  _kwargs["json"] = body.to_dict()

  headers["Content-Type"] = "application/json"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | TransactionSchema | None:
  if response.status_code == 200:
    response_200 = TransactionSchema.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | TransactionSchema]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  transaction_id: UUID,
  *,
  client: AuthenticatedClient | Client,
  body: TransactionUpdate,
) -> Response[HTTPValidationError | TransactionSchema]:
  """Update Transaction

   Update a transaction.

  Args:
      transaction_id (UUID):
      body (TransactionUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TransactionSchema]
  """

  kwargs = _get_kwargs(
    transaction_id=transaction_id,
    body=body,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  transaction_id: UUID,
  *,
  client: AuthenticatedClient | Client,
  body: TransactionUpdate,
) -> HTTPValidationError | TransactionSchema | None:
  """Update Transaction

   Update a transaction.

  Args:
      transaction_id (UUID):
      body (TransactionUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TransactionSchema
  """

  return sync_detailed(
    transaction_id=transaction_id,
    client=client,
    body=body,
  ).parsed


async def asyncio_detailed(
  transaction_id: UUID,
  *,
  client: AuthenticatedClient | Client,
  body: TransactionUpdate,
) -> Response[HTTPValidationError | TransactionSchema]:
  """Update Transaction

   Update a transaction.

  Args:
      transaction_id (UUID):
      body (TransactionUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TransactionSchema]
  """

  kwargs = _get_kwargs(
    transaction_id=transaction_id,
    body=body,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  transaction_id: UUID,
  *,
  client: AuthenticatedClient | Client,
  body: TransactionUpdate,
) -> HTTPValidationError | TransactionSchema | None:
  """Update Transaction

   Update a transaction.

  Args:
      transaction_id (UUID):
      body (TransactionUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TransactionSchema
  """

  return (
    await asyncio_detailed(
      transaction_id=transaction_id,
      client=client,
      body=body,
    )
  ).parsed
