from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.gym_exercise_schema import GymExerciseSchema
from ...models.gym_exercise_upsert import GymExerciseUpsert
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
  exercise_id: UUID,
  *,
  body: GymExerciseUpsert,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "put",
    "url": "/v1/gym/exercises/{exercise_id}".format(
      exercise_id=quote(str(exercise_id), safe=""),
    ),
  }

  _kwargs["json"] = body.to_dict()

  headers["Content-Type"] = "application/json"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> GymExerciseSchema | HTTPValidationError | None:
  if response.status_code == 200:
    response_200 = GymExerciseSchema.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[GymExerciseSchema | HTTPValidationError]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  exercise_id: UUID,
  *,
  client: AuthenticatedClient,
  body: GymExerciseUpsert,
) -> Response[GymExerciseSchema | HTTPValidationError]:
  """Create or Rename Gym Exercise

   The id is chosen by the app, so creating twice is the same as creating once.

  Args:
      exercise_id (UUID):
      body (GymExerciseUpsert):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[GymExerciseSchema | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    exercise_id=exercise_id,
    body=body,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  exercise_id: UUID,
  *,
  client: AuthenticatedClient,
  body: GymExerciseUpsert,
) -> GymExerciseSchema | HTTPValidationError | None:
  """Create or Rename Gym Exercise

   The id is chosen by the app, so creating twice is the same as creating once.

  Args:
      exercise_id (UUID):
      body (GymExerciseUpsert):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      GymExerciseSchema | HTTPValidationError
  """

  return sync_detailed(
    exercise_id=exercise_id,
    client=client,
    body=body,
  ).parsed


async def asyncio_detailed(
  exercise_id: UUID,
  *,
  client: AuthenticatedClient,
  body: GymExerciseUpsert,
) -> Response[GymExerciseSchema | HTTPValidationError]:
  """Create or Rename Gym Exercise

   The id is chosen by the app, so creating twice is the same as creating once.

  Args:
      exercise_id (UUID):
      body (GymExerciseUpsert):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[GymExerciseSchema | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    exercise_id=exercise_id,
    body=body,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  exercise_id: UUID,
  *,
  client: AuthenticatedClient,
  body: GymExerciseUpsert,
) -> GymExerciseSchema | HTTPValidationError | None:
  """Create or Rename Gym Exercise

   The id is chosen by the app, so creating twice is the same as creating once.

  Args:
      exercise_id (UUID):
      body (GymExerciseUpsert):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      GymExerciseSchema | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      exercise_id=exercise_id,
      client=client,
      body=body,
    )
  ).parsed
