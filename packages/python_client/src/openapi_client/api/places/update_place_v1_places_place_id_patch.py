from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.place_schema import PlaceSchema
from ...models.place_update import PlaceUpdate
from ...types import Response


def _get_kwargs(
  place_id: UUID,
  *,
  body: PlaceUpdate,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "patch",
    "url": "/v1/places/{place_id}".format(
      place_id=quote(str(place_id), safe=""),
    ),
  }

  _kwargs["json"] = body.to_dict()

  headers["Content-Type"] = "application/json"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | PlaceSchema | None:
  if response.status_code == 200:
    response_200 = PlaceSchema.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | PlaceSchema]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  place_id: UUID,
  *,
  client: AuthenticatedClient | Client,
  body: PlaceUpdate,
) -> Response[HTTPValidationError | PlaceSchema]:
  """Update Place

  Args:
      place_id (UUID):
      body (PlaceUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | PlaceSchema]
  """

  kwargs = _get_kwargs(
    place_id=place_id,
    body=body,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  place_id: UUID,
  *,
  client: AuthenticatedClient | Client,
  body: PlaceUpdate,
) -> HTTPValidationError | PlaceSchema | None:
  """Update Place

  Args:
      place_id (UUID):
      body (PlaceUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | PlaceSchema
  """

  return sync_detailed(
    place_id=place_id,
    client=client,
    body=body,
  ).parsed


async def asyncio_detailed(
  place_id: UUID,
  *,
  client: AuthenticatedClient | Client,
  body: PlaceUpdate,
) -> Response[HTTPValidationError | PlaceSchema]:
  """Update Place

  Args:
      place_id (UUID):
      body (PlaceUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | PlaceSchema]
  """

  kwargs = _get_kwargs(
    place_id=place_id,
    body=body,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  place_id: UUID,
  *,
  client: AuthenticatedClient | Client,
  body: PlaceUpdate,
) -> HTTPValidationError | PlaceSchema | None:
  """Update Place

  Args:
      place_id (UUID):
      body (PlaceUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | PlaceSchema
  """

  return (
    await asyncio_detailed(
      place_id=place_id,
      client=client,
      body=body,
    )
  ).parsed
