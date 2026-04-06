from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.security_schema import SecuritySchema
from ...models.security_update import SecurityUpdate
from ...types import Response


def _get_kwargs(
  security_id: UUID,
  *,
  body: SecurityUpdate,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "patch",
    "url": "/v1/investments/securities/{security_id}".format(
      security_id=quote(str(security_id), safe=""),
    ),
  }

  _kwargs["json"] = body.to_dict()

  headers["Content-Type"] = "application/json"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | SecuritySchema | None:
  if response.status_code == 200:
    response_200 = SecuritySchema.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | SecuritySchema]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  security_id: UUID,
  *,
  client: AuthenticatedClient | Client,
  body: SecurityUpdate,
) -> Response[HTTPValidationError | SecuritySchema]:
  """Update Security

  Args:
      security_id (UUID):
      body (SecurityUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | SecuritySchema]
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
  client: AuthenticatedClient | Client,
  body: SecurityUpdate,
) -> HTTPValidationError | SecuritySchema | None:
  """Update Security

  Args:
      security_id (UUID):
      body (SecurityUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | SecuritySchema
  """

  return sync_detailed(
    security_id=security_id,
    client=client,
    body=body,
  ).parsed


async def asyncio_detailed(
  security_id: UUID,
  *,
  client: AuthenticatedClient | Client,
  body: SecurityUpdate,
) -> Response[HTTPValidationError | SecuritySchema]:
  """Update Security

  Args:
      security_id (UUID):
      body (SecurityUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | SecuritySchema]
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
  client: AuthenticatedClient | Client,
  body: SecurityUpdate,
) -> HTTPValidationError | SecuritySchema | None:
  """Update Security

  Args:
      security_id (UUID):
      body (SecurityUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | SecuritySchema
  """

  return (
    await asyncio_detailed(
      security_id=security_id,
      client=client,
      body=body,
    )
  ).parsed
