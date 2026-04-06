from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.last_session_response import LastSessionResponse
from ...types import Response


def _get_kwargs(
  exercise_id: UUID,
) -> dict[str, Any]:

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/workouts/exercises/{exercise_id}/last-session".format(
      exercise_id=quote(str(exercise_id), safe=""),
    ),
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | LastSessionResponse | None:
  if response.status_code == 200:
    response_200 = LastSessionResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | LastSessionResponse]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  exercise_id: UUID,
  *,
  client: AuthenticatedClient | Client,
) -> Response[HTTPValidationError | LastSessionResponse]:
  """Get Last Session for Exercise

  Args:
      exercise_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | LastSessionResponse]
  """

  kwargs = _get_kwargs(
    exercise_id=exercise_id,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  exercise_id: UUID,
  *,
  client: AuthenticatedClient | Client,
) -> HTTPValidationError | LastSessionResponse | None:
  """Get Last Session for Exercise

  Args:
      exercise_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | LastSessionResponse
  """

  return sync_detailed(
    exercise_id=exercise_id,
    client=client,
  ).parsed


async def asyncio_detailed(
  exercise_id: UUID,
  *,
  client: AuthenticatedClient | Client,
) -> Response[HTTPValidationError | LastSessionResponse]:
  """Get Last Session for Exercise

  Args:
      exercise_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | LastSessionResponse]
  """

  kwargs = _get_kwargs(
    exercise_id=exercise_id,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  exercise_id: UUID,
  *,
  client: AuthenticatedClient | Client,
) -> HTTPValidationError | LastSessionResponse | None:
  """Get Last Session for Exercise

  Args:
      exercise_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | LastSessionResponse
  """

  return (
    await asyncio_detailed(
      exercise_id=exercise_id,
      client=client,
    )
  ).parsed
