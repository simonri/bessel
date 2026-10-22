from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.document_schema import DocumentSchema
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
  transaction_id: UUID,
) -> dict[str, Any]:

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/transactions/{transaction_id}/documents".format(
      transaction_id=quote(str(transaction_id), safe=""),
    ),
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | list[DocumentSchema] | None:
  if response.status_code == 200:
    response_200 = []
    _response_200 = response.json()
    for response_200_item_data in _response_200:
      response_200_item = DocumentSchema.from_dict(response_200_item_data)

      response_200.append(response_200_item)

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | list[DocumentSchema]]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  transaction_id: UUID,
  *,
  client: AuthenticatedClient,
) -> Response[HTTPValidationError | list[DocumentSchema]]:
  """List Transaction Documents

   The invoices and receipts kept with a transaction, oldest first.

  Args:
      transaction_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | list[DocumentSchema]]
  """

  kwargs = _get_kwargs(
    transaction_id=transaction_id,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  transaction_id: UUID,
  *,
  client: AuthenticatedClient,
) -> HTTPValidationError | list[DocumentSchema] | None:
  """List Transaction Documents

   The invoices and receipts kept with a transaction, oldest first.

  Args:
      transaction_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | list[DocumentSchema]
  """

  return sync_detailed(
    transaction_id=transaction_id,
    client=client,
  ).parsed


async def asyncio_detailed(
  transaction_id: UUID,
  *,
  client: AuthenticatedClient,
) -> Response[HTTPValidationError | list[DocumentSchema]]:
  """List Transaction Documents

   The invoices and receipts kept with a transaction, oldest first.

  Args:
      transaction_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | list[DocumentSchema]]
  """

  kwargs = _get_kwargs(
    transaction_id=transaction_id,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  transaction_id: UUID,
  *,
  client: AuthenticatedClient,
) -> HTTPValidationError | list[DocumentSchema] | None:
  """List Transaction Documents

   The invoices and receipts kept with a transaction, oldest first.

  Args:
      transaction_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | list[DocumentSchema]
  """

  return (
    await asyncio_detailed(
      transaction_id=transaction_id,
      client=client,
    )
  ).parsed
