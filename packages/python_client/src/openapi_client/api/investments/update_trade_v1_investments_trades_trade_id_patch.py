from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.trade_schema import TradeSchema
from ...models.trade_update import TradeUpdate
from ...types import Response


def _get_kwargs(
  trade_id: UUID,
  *,
  body: TradeUpdate,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "patch",
    "url": "/v1/investments/trades/{trade_id}".format(
      trade_id=quote(str(trade_id), safe=""),
    ),
  }

  _kwargs["json"] = body.to_dict()

  headers["Content-Type"] = "application/json"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | TradeSchema | None:
  if response.status_code == 200:
    response_200 = TradeSchema.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | TradeSchema]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  trade_id: UUID,
  *,
  client: AuthenticatedClient,
  body: TradeUpdate,
) -> Response[HTTPValidationError | TradeSchema]:
  """Update Trade

  Args:
      trade_id (UUID):
      body (TradeUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TradeSchema]
  """

  kwargs = _get_kwargs(
    trade_id=trade_id,
    body=body,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  trade_id: UUID,
  *,
  client: AuthenticatedClient,
  body: TradeUpdate,
) -> HTTPValidationError | TradeSchema | None:
  """Update Trade

  Args:
      trade_id (UUID):
      body (TradeUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TradeSchema
  """

  return sync_detailed(
    trade_id=trade_id,
    client=client,
    body=body,
  ).parsed


async def asyncio_detailed(
  trade_id: UUID,
  *,
  client: AuthenticatedClient,
  body: TradeUpdate,
) -> Response[HTTPValidationError | TradeSchema]:
  """Update Trade

  Args:
      trade_id (UUID):
      body (TradeUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TradeSchema]
  """

  kwargs = _get_kwargs(
    trade_id=trade_id,
    body=body,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  trade_id: UUID,
  *,
  client: AuthenticatedClient,
  body: TradeUpdate,
) -> HTTPValidationError | TradeSchema | None:
  """Update Trade

  Args:
      trade_id (UUID):
      body (TradeUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TradeSchema
  """

  return (
    await asyncio_detailed(
      trade_id=trade_id,
      client=client,
      body=body,
    )
  ).parsed
