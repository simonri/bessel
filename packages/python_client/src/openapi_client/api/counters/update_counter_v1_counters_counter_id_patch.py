from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.counter_schema import CounterSchema
from ...models.counter_update import CounterUpdate
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
  counter_id: UUID,
  *,
  body: CounterUpdate,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "patch",
    "url": "/v1/counters/{counter_id}".format(
      counter_id=quote(str(counter_id), safe=""),
    ),
  }

  _kwargs["json"] = body.to_dict()

  headers["Content-Type"] = "application/json"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> CounterSchema | HTTPValidationError | None:
  if response.status_code == 200:
    response_200 = CounterSchema.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[CounterSchema | HTTPValidationError]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  counter_id: UUID,
  *,
  client: AuthenticatedClient,
  body: CounterUpdate,
) -> Response[CounterSchema | HTTPValidationError]:
  """Update Counter

  Args:
      counter_id (UUID):
      body (CounterUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[CounterSchema | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    counter_id=counter_id,
    body=body,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  counter_id: UUID,
  *,
  client: AuthenticatedClient,
  body: CounterUpdate,
) -> CounterSchema | HTTPValidationError | None:
  """Update Counter

  Args:
      counter_id (UUID):
      body (CounterUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      CounterSchema | HTTPValidationError
  """

  return sync_detailed(
    counter_id=counter_id,
    client=client,
    body=body,
  ).parsed


async def asyncio_detailed(
  counter_id: UUID,
  *,
  client: AuthenticatedClient,
  body: CounterUpdate,
) -> Response[CounterSchema | HTTPValidationError]:
  """Update Counter

  Args:
      counter_id (UUID):
      body (CounterUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[CounterSchema | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    counter_id=counter_id,
    body=body,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  counter_id: UUID,
  *,
  client: AuthenticatedClient,
  body: CounterUpdate,
) -> CounterSchema | HTTPValidationError | None:
  """Update Counter

  Args:
      counter_id (UUID):
      body (CounterUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      CounterSchema | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      counter_id=counter_id,
      client=client,
      body=body,
    )
  ).parsed
