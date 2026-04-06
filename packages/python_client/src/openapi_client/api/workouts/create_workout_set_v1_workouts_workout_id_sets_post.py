from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.workout_set_create import WorkoutSetCreate
from ...models.workout_set_schema import WorkoutSetSchema
from ...types import Response


def _get_kwargs(
  workout_id: UUID,
  *,
  body: WorkoutSetCreate,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "post",
    "url": "/v1/workouts/{workout_id}/sets".format(
      workout_id=quote(str(workout_id), safe=""),
    ),
  }

  _kwargs["json"] = body.to_dict()

  headers["Content-Type"] = "application/json"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | WorkoutSetSchema | None:
  if response.status_code == 201:
    response_201 = WorkoutSetSchema.from_dict(response.json())

    return response_201

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | WorkoutSetSchema]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  workout_id: UUID,
  *,
  client: AuthenticatedClient | Client,
  body: WorkoutSetCreate,
) -> Response[HTTPValidationError | WorkoutSetSchema]:
  """Add Set to Workout

  Args:
      workout_id (UUID):
      body (WorkoutSetCreate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | WorkoutSetSchema]
  """

  kwargs = _get_kwargs(
    workout_id=workout_id,
    body=body,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  workout_id: UUID,
  *,
  client: AuthenticatedClient | Client,
  body: WorkoutSetCreate,
) -> HTTPValidationError | WorkoutSetSchema | None:
  """Add Set to Workout

  Args:
      workout_id (UUID):
      body (WorkoutSetCreate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | WorkoutSetSchema
  """

  return sync_detailed(
    workout_id=workout_id,
    client=client,
    body=body,
  ).parsed


async def asyncio_detailed(
  workout_id: UUID,
  *,
  client: AuthenticatedClient | Client,
  body: WorkoutSetCreate,
) -> Response[HTTPValidationError | WorkoutSetSchema]:
  """Add Set to Workout

  Args:
      workout_id (UUID):
      body (WorkoutSetCreate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | WorkoutSetSchema]
  """

  kwargs = _get_kwargs(
    workout_id=workout_id,
    body=body,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  workout_id: UUID,
  *,
  client: AuthenticatedClient | Client,
  body: WorkoutSetCreate,
) -> HTTPValidationError | WorkoutSetSchema | None:
  """Add Set to Workout

  Args:
      workout_id (UUID):
      body (WorkoutSetCreate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | WorkoutSetSchema
  """

  return (
    await asyncio_detailed(
      workout_id=workout_id,
      client=client,
      body=body,
    )
  ).parsed
