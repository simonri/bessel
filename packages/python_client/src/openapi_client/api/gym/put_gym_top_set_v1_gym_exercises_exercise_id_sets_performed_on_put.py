import datetime
from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.gym_top_set_schema import GymTopSetSchema
from ...models.gym_top_set_upsert import GymTopSetUpsert
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
  exercise_id: UUID,
  performed_on: datetime.date,
  *,
  body: GymTopSetUpsert,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "put",
    "url": "/v1/gym/exercises/{exercise_id}/sets/{performed_on}".format(
      exercise_id=quote(str(exercise_id), safe=""),
      performed_on=quote(str(performed_on), safe=""),
    ),
  }

  _kwargs["json"] = body.to_dict()

  headers["Content-Type"] = "application/json"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> GymTopSetSchema | HTTPValidationError | None:
  if response.status_code == 200:
    response_200 = GymTopSetSchema.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[GymTopSetSchema | HTTPValidationError]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  exercise_id: UUID,
  performed_on: datetime.date,
  *,
  client: AuthenticatedClient,
  body: GymTopSetUpsert,
) -> Response[GymTopSetSchema | HTTPValidationError]:
  """Set Gym Top Set

   The day's top set for the exercise, replacing one already logged. The day
  is the app's local date, so a set sent late still lands on the day it was lifted.

  Args:
      exercise_id (UUID):
      performed_on (datetime.date):
      body (GymTopSetUpsert):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[GymTopSetSchema | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    exercise_id=exercise_id,
    performed_on=performed_on,
    body=body,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  exercise_id: UUID,
  performed_on: datetime.date,
  *,
  client: AuthenticatedClient,
  body: GymTopSetUpsert,
) -> GymTopSetSchema | HTTPValidationError | None:
  """Set Gym Top Set

   The day's top set for the exercise, replacing one already logged. The day
  is the app's local date, so a set sent late still lands on the day it was lifted.

  Args:
      exercise_id (UUID):
      performed_on (datetime.date):
      body (GymTopSetUpsert):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      GymTopSetSchema | HTTPValidationError
  """

  return sync_detailed(
    exercise_id=exercise_id,
    performed_on=performed_on,
    client=client,
    body=body,
  ).parsed


async def asyncio_detailed(
  exercise_id: UUID,
  performed_on: datetime.date,
  *,
  client: AuthenticatedClient,
  body: GymTopSetUpsert,
) -> Response[GymTopSetSchema | HTTPValidationError]:
  """Set Gym Top Set

   The day's top set for the exercise, replacing one already logged. The day
  is the app's local date, so a set sent late still lands on the day it was lifted.

  Args:
      exercise_id (UUID):
      performed_on (datetime.date):
      body (GymTopSetUpsert):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[GymTopSetSchema | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    exercise_id=exercise_id,
    performed_on=performed_on,
    body=body,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  exercise_id: UUID,
  performed_on: datetime.date,
  *,
  client: AuthenticatedClient,
  body: GymTopSetUpsert,
) -> GymTopSetSchema | HTTPValidationError | None:
  """Set Gym Top Set

   The day's top set for the exercise, replacing one already logged. The day
  is the app's local date, so a set sent late still lands on the day it was lifted.

  Args:
      exercise_id (UUID):
      performed_on (datetime.date):
      body (GymTopSetUpsert):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      GymTopSetSchema | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      exercise_id=exercise_id,
      performed_on=performed_on,
      client=client,
      body=body,
    )
  ).parsed
