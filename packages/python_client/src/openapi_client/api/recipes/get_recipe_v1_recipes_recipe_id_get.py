from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.recipe_schema import RecipeSchema
from ...types import Response


def _get_kwargs(
  recipe_id: UUID,
) -> dict[str, Any]:

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/recipes/{recipe_id}".format(
      recipe_id=quote(str(recipe_id), safe=""),
    ),
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | RecipeSchema | None:
  if response.status_code == 200:
    response_200 = RecipeSchema.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | RecipeSchema]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  recipe_id: UUID,
  *,
  client: AuthenticatedClient,
) -> Response[HTTPValidationError | RecipeSchema]:
  """Get Recipe

  Args:
      recipe_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | RecipeSchema]
  """

  kwargs = _get_kwargs(
    recipe_id=recipe_id,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  recipe_id: UUID,
  *,
  client: AuthenticatedClient,
) -> HTTPValidationError | RecipeSchema | None:
  """Get Recipe

  Args:
      recipe_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | RecipeSchema
  """

  return sync_detailed(
    recipe_id=recipe_id,
    client=client,
  ).parsed


async def asyncio_detailed(
  recipe_id: UUID,
  *,
  client: AuthenticatedClient,
) -> Response[HTTPValidationError | RecipeSchema]:
  """Get Recipe

  Args:
      recipe_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | RecipeSchema]
  """

  kwargs = _get_kwargs(
    recipe_id=recipe_id,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  recipe_id: UUID,
  *,
  client: AuthenticatedClient,
) -> HTTPValidationError | RecipeSchema | None:
  """Get Recipe

  Args:
      recipe_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | RecipeSchema
  """

  return (
    await asyncio_detailed(
      recipe_id=recipe_id,
      client=client,
    )
  ).parsed
