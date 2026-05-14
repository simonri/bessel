from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.import_response import ImportResponse
from ...models.klarna_import_request import KlarnaImportRequest
from ...types import Response


def _get_kwargs(
  *,
  body: KlarnaImportRequest,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "post",
    "url": "/v1/klarna/import",
  }

  _kwargs["json"] = body.to_dict()

  headers["Content-Type"] = "application/json"

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
  body: KlarnaImportRequest,
) -> Response[HTTPValidationError | ImportResponse]:
  """Import Klarna Transactions

   Fetch Klarna transactions and import them into Metron.
  Skips rejected (isAmountLineThrough), pending, and duplicate transactions.

  Args:
      body (KlarnaImportRequest):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | ImportResponse]
  """

  kwargs = _get_kwargs(
    body=body,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  *,
  client: AuthenticatedClient | Client,
  body: KlarnaImportRequest,
) -> HTTPValidationError | ImportResponse | None:
  """Import Klarna Transactions

   Fetch Klarna transactions and import them into Metron.
  Skips rejected (isAmountLineThrough), pending, and duplicate transactions.

  Args:
      body (KlarnaImportRequest):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | ImportResponse
  """

  return sync_detailed(
    client=client,
    body=body,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient | Client,
  body: KlarnaImportRequest,
) -> Response[HTTPValidationError | ImportResponse]:
  """Import Klarna Transactions

   Fetch Klarna transactions and import them into Metron.
  Skips rejected (isAmountLineThrough), pending, and duplicate transactions.

  Args:
      body (KlarnaImportRequest):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | ImportResponse]
  """

  kwargs = _get_kwargs(
    body=body,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient | Client,
  body: KlarnaImportRequest,
) -> HTTPValidationError | ImportResponse | None:
  """Import Klarna Transactions

   Fetch Klarna transactions and import them into Metron.
  Skips rejected (isAmountLineThrough), pending, and duplicate transactions.

  Args:
      body (KlarnaImportRequest):

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
    )
  ).parsed
