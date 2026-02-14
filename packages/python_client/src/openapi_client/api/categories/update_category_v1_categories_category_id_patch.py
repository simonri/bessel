from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.category_schema import CategorySchema
from ...models.category_update import CategoryUpdate
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
  category_id: UUID,
  *,
  body: CategoryUpdate,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "patch",
    "url": "/v1/categories/{category_id}".format(
      category_id=quote(str(category_id), safe=""),
    ),
  }

  _kwargs["json"] = body.to_dict()

  headers["Content-Type"] = "application/json"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> CategorySchema | HTTPValidationError | None:
  if response.status_code == 200:
    response_200 = CategorySchema.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[CategorySchema | HTTPValidationError]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  category_id: UUID,
  *,
  client: AuthenticatedClient | Client,
  body: CategoryUpdate,
) -> Response[CategorySchema | HTTPValidationError]:
  """Update Category

   Update a category.

  Args:
      category_id (UUID):
      body (CategoryUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[CategorySchema | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    category_id=category_id,
    body=body,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  category_id: UUID,
  *,
  client: AuthenticatedClient | Client,
  body: CategoryUpdate,
) -> CategorySchema | HTTPValidationError | None:
  """Update Category

   Update a category.

  Args:
      category_id (UUID):
      body (CategoryUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      CategorySchema | HTTPValidationError
  """

  return sync_detailed(
    category_id=category_id,
    client=client,
    body=body,
  ).parsed


async def asyncio_detailed(
  category_id: UUID,
  *,
  client: AuthenticatedClient | Client,
  body: CategoryUpdate,
) -> Response[CategorySchema | HTTPValidationError]:
  """Update Category

   Update a category.

  Args:
      category_id (UUID):
      body (CategoryUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[CategorySchema | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    category_id=category_id,
    body=body,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  category_id: UUID,
  *,
  client: AuthenticatedClient | Client,
  body: CategoryUpdate,
) -> CategorySchema | HTTPValidationError | None:
  """Update Category

   Update a category.

  Args:
      category_id (UUID):
      body (CategoryUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      CategorySchema | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      category_id=category_id,
      client=client,
      body=body,
    )
  ).parsed
