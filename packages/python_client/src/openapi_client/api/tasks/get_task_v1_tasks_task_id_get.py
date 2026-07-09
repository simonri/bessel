from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.task_schema import TaskSchema
from ...types import Response


def _get_kwargs(
  task_id: UUID,
) -> dict[str, Any]:

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/tasks/{task_id}".format(
      task_id=quote(str(task_id), safe=""),
    ),
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | TaskSchema | None:
  if response.status_code == 200:
    response_200 = TaskSchema.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | TaskSchema]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  task_id: UUID,
  *,
  client: AuthenticatedClient,
) -> Response[HTTPValidationError | TaskSchema]:
  """Get Task

  Args:
      task_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TaskSchema]
  """

  kwargs = _get_kwargs(
    task_id=task_id,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  task_id: UUID,
  *,
  client: AuthenticatedClient,
) -> HTTPValidationError | TaskSchema | None:
  """Get Task

  Args:
      task_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TaskSchema
  """

  return sync_detailed(
    task_id=task_id,
    client=client,
  ).parsed


async def asyncio_detailed(
  task_id: UUID,
  *,
  client: AuthenticatedClient,
) -> Response[HTTPValidationError | TaskSchema]:
  """Get Task

  Args:
      task_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TaskSchema]
  """

  kwargs = _get_kwargs(
    task_id=task_id,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  task_id: UUID,
  *,
  client: AuthenticatedClient,
) -> HTTPValidationError | TaskSchema | None:
  """Get Task

  Args:
      task_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TaskSchema
  """

  return (
    await asyncio_detailed(
      task_id=task_id,
      client=client,
    )
  ).parsed
