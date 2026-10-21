from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.avanza_account_update import AvanzaAccountUpdate
from ...models.avanza_connection_schema import AvanzaConnectionSchema
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
  account_id: UUID,
  *,
  body: AvanzaAccountUpdate,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "patch",
    "url": "/v1/avanza/accounts/{account_id}".format(
      account_id=quote(str(account_id), safe=""),
    ),
  }

  _kwargs["json"] = body.to_dict()

  headers["Content-Type"] = "application/json"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> AvanzaConnectionSchema | HTTPValidationError | None:
  if response.status_code == 200:
    response_200 = AvanzaConnectionSchema.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[AvanzaConnectionSchema | HTTPValidationError]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  account_id: UUID,
  *,
  client: AuthenticatedClient,
  body: AvanzaAccountUpdate,
) -> Response[AvanzaConnectionSchema | HTTPValidationError]:
  """Link Avanza Account

  Args:
      account_id (UUID):
      body (AvanzaAccountUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[AvanzaConnectionSchema | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    account_id=account_id,
    body=body,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  account_id: UUID,
  *,
  client: AuthenticatedClient,
  body: AvanzaAccountUpdate,
) -> AvanzaConnectionSchema | HTTPValidationError | None:
  """Link Avanza Account

  Args:
      account_id (UUID):
      body (AvanzaAccountUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      AvanzaConnectionSchema | HTTPValidationError
  """

  return sync_detailed(
    account_id=account_id,
    client=client,
    body=body,
  ).parsed


async def asyncio_detailed(
  account_id: UUID,
  *,
  client: AuthenticatedClient,
  body: AvanzaAccountUpdate,
) -> Response[AvanzaConnectionSchema | HTTPValidationError]:
  """Link Avanza Account

  Args:
      account_id (UUID):
      body (AvanzaAccountUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[AvanzaConnectionSchema | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    account_id=account_id,
    body=body,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  account_id: UUID,
  *,
  client: AuthenticatedClient,
  body: AvanzaAccountUpdate,
) -> AvanzaConnectionSchema | HTTPValidationError | None:
  """Link Avanza Account

  Args:
      account_id (UUID):
      body (AvanzaAccountUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      AvanzaConnectionSchema | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      account_id=account_id,
      client=client,
      body=body,
    )
  ).parsed
