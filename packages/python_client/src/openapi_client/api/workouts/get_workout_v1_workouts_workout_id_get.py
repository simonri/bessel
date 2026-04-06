from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.workout_log_detail_schema import WorkoutLogDetailSchema
from ...types import Response


def _get_kwargs(
  workout_id: UUID,
) -> dict[str, Any]:

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/workouts/{workout_id}".format(
      workout_id=quote(str(workout_id), safe=""),
    ),
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | WorkoutLogDetailSchema | None:
  if response.status_code == 200:
    response_200 = WorkoutLogDetailSchema.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | WorkoutLogDetailSchema]:
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
) -> Response[HTTPValidationError | WorkoutLogDetailSchema]:
  """Get Workout Detail

  Args:
      workout_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | WorkoutLogDetailSchema]
  """

  kwargs = _get_kwargs(
    workout_id=workout_id,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  workout_id: UUID,
  *,
  client: AuthenticatedClient | Client,
) -> HTTPValidationError | WorkoutLogDetailSchema | None:
  """Get Workout Detail

  Args:
      workout_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | WorkoutLogDetailSchema
  """

  return sync_detailed(
    workout_id=workout_id,
    client=client,
  ).parsed


async def asyncio_detailed(
  workout_id: UUID,
  *,
  client: AuthenticatedClient | Client,
) -> Response[HTTPValidationError | WorkoutLogDetailSchema]:
  """Get Workout Detail

  Args:
      workout_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | WorkoutLogDetailSchema]
  """

  kwargs = _get_kwargs(
    workout_id=workout_id,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  workout_id: UUID,
  *,
  client: AuthenticatedClient | Client,
) -> HTTPValidationError | WorkoutLogDetailSchema | None:
  """Get Workout Detail

  Args:
      workout_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | WorkoutLogDetailSchema
  """

  return (
    await asyncio_detailed(
      workout_id=workout_id,
      client=client,
    )
  ).parsed
