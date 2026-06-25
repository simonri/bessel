from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.security_price_create import SecurityPriceCreate
from ...models.security_price_schema import SecurityPriceSchema
from ...types import Response


def _get_kwargs(
  security_id: UUID,
  *,
  body: SecurityPriceCreate,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "post",
    "url": "/v1/investments/securities/{security_id}/prices".format(
      security_id=quote(str(security_id), safe=""),
    ),
  }

  _kwargs["json"] = body.to_dict()

  headers["Content-Type"] = "application/json"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | SecurityPriceSchema | None:
  if response.status_code == 201:
    response_201 = SecurityPriceSchema.from_dict(response.json())

    return response_201

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | SecurityPriceSchema]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  security_id: UUID,
  *,
  client: AuthenticatedClient,
  body: SecurityPriceCreate,
) -> Response[HTTPValidationError | SecurityPriceSchema]:
  """Add Security Price

  Args:
      security_id (UUID):
      body (SecurityPriceCreate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | SecurityPriceSchema]
  """

  kwargs = _get_kwargs(
    security_id=security_id,
    body=body,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  security_id: UUID,
  *,
  client: AuthenticatedClient,
  body: SecurityPriceCreate,
) -> HTTPValidationError | SecurityPriceSchema | None:
  """Add Security Price

  Args:
      security_id (UUID):
      body (SecurityPriceCreate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | SecurityPriceSchema
  """

  return sync_detailed(
    security_id=security_id,
    client=client,
    body=body,
  ).parsed


async def asyncio_detailed(
  security_id: UUID,
  *,
  client: AuthenticatedClient,
  body: SecurityPriceCreate,
) -> Response[HTTPValidationError | SecurityPriceSchema]:
  """Add Security Price

  Args:
      security_id (UUID):
      body (SecurityPriceCreate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | SecurityPriceSchema]
  """

  kwargs = _get_kwargs(
    security_id=security_id,
    body=body,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  security_id: UUID,
  *,
  client: AuthenticatedClient,
  body: SecurityPriceCreate,
) -> HTTPValidationError | SecurityPriceSchema | None:
  """Add Security Price

  Args:
      security_id (UUID):
      body (SecurityPriceCreate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | SecurityPriceSchema
  """

  return (
    await asyncio_detailed(
      security_id=security_id,
      client=client,
      body=body,
    )
  ).parsed
