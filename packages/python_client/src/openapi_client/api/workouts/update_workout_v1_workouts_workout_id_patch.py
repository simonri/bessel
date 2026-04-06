from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.workout_log_schema import WorkoutLogSchema
from ...models.workout_log_update import WorkoutLogUpdate
from ...types import Response


def _get_kwargs(
  workout_id: UUID,
  *,
  body: WorkoutLogUpdate,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "patch",
    "url": "/v1/workouts/{workout_id}".format(
      workout_id=quote(str(workout_id), safe=""),
    ),
  }

  _kwargs["json"] = body.to_dict()

  headers["Content-Type"] = "application/json"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | WorkoutLogSchema | None:
  if response.status_code == 200:
    response_200 = WorkoutLogSchema.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | WorkoutLogSchema]:
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
  body: WorkoutLogUpdate,
) -> Response[HTTPValidationError | WorkoutLogSchema]:
  """Update Workout

  Args:
      workout_id (UUID):
      body (WorkoutLogUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | WorkoutLogSchema]
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
  body: WorkoutLogUpdate,
) -> HTTPValidationError | WorkoutLogSchema | None:
  """Update Workout

  Args:
      workout_id (UUID):
      body (WorkoutLogUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | WorkoutLogSchema
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
  body: WorkoutLogUpdate,
) -> Response[HTTPValidationError | WorkoutLogSchema]:
  """Update Workout

  Args:
      workout_id (UUID):
      body (WorkoutLogUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | WorkoutLogSchema]
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
  body: WorkoutLogUpdate,
) -> HTTPValidationError | WorkoutLogSchema | None:
  """Update Workout

  Args:
      workout_id (UUID):
      body (WorkoutLogUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | WorkoutLogSchema
  """

  return (
    await asyncio_detailed(
      workout_id=workout_id,
      client=client,
      body=body,
    )
  ).parsed
