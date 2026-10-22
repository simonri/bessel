from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.body_add_transaction_document_v1_transactions_transaction_id_documents_post import (
  BodyAddTransactionDocumentV1TransactionsTransactionIdDocumentsPost,
)
from ...models.document_schema import DocumentSchema
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
  transaction_id: UUID,
  *,
  body: BodyAddTransactionDocumentV1TransactionsTransactionIdDocumentsPost,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "post",
    "url": "/v1/transactions/{transaction_id}/documents".format(
      transaction_id=quote(str(transaction_id), safe=""),
    ),
  }

  _kwargs["files"] = body.to_multipart()

  headers["Content-Type"] = "multipart/form-data; boundary=+++"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> DocumentSchema | HTTPValidationError | None:
  if response.status_code == 201:
    response_201 = DocumentSchema.from_dict(response.json())

    return response_201

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[DocumentSchema | HTTPValidationError]:
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
  body: BodyAddTransactionDocumentV1TransactionsTransactionIdDocumentsPost,
) -> Response[DocumentSchema | HTTPValidationError]:
  """Add Transaction Document

   Keeps an invoice or receipt, a PDF or a photo, with the transaction.

  Args:
      transaction_id (UUID):
      body (BodyAddTransactionDocumentV1TransactionsTransactionIdDocumentsPost):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[DocumentSchema | HTTPValidationError]
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
  client: AuthenticatedClient,
  body: BodyAddTransactionDocumentV1TransactionsTransactionIdDocumentsPost,
) -> DocumentSchema | HTTPValidationError | None:
  """Add Transaction Document

   Keeps an invoice or receipt, a PDF or a photo, with the transaction.

  Args:
      transaction_id (UUID):
      body (BodyAddTransactionDocumentV1TransactionsTransactionIdDocumentsPost):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      DocumentSchema | HTTPValidationError
  """

  return sync_detailed(
    transaction_id=transaction_id,
    client=client,
    body=body,
  ).parsed


async def asyncio_detailed(
  transaction_id: UUID,
  *,
  client: AuthenticatedClient,
  body: BodyAddTransactionDocumentV1TransactionsTransactionIdDocumentsPost,
) -> Response[DocumentSchema | HTTPValidationError]:
  """Add Transaction Document

   Keeps an invoice or receipt, a PDF or a photo, with the transaction.

  Args:
      transaction_id (UUID):
      body (BodyAddTransactionDocumentV1TransactionsTransactionIdDocumentsPost):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[DocumentSchema | HTTPValidationError]
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
  client: AuthenticatedClient,
  body: BodyAddTransactionDocumentV1TransactionsTransactionIdDocumentsPost,
) -> DocumentSchema | HTTPValidationError | None:
  """Add Transaction Document

   Keeps an invoice or receipt, a PDF or a photo, with the transaction.

  Args:
      transaction_id (UUID):
      body (BodyAddTransactionDocumentV1TransactionsTransactionIdDocumentsPost):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      DocumentSchema | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      transaction_id=transaction_id,
      client=client,
      body=body,
    )
  ).parsed
