from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.exercise_list_response import ExerciseListResponse
from ...models.http_validation_error import HTTPValidationError
from ...models.muscle_category import MuscleCategory
from ...types import UNSET, Response, Unset


def _get_kwargs(
  *,
  q: None | str | Unset = UNSET,
  category: MuscleCategory | None | Unset = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  json_q: None | str | Unset
  if isinstance(q, Unset):
    json_q = UNSET
  else:
    json_q = q
  params["q"] = json_q

  json_category: None | str | Unset
  if isinstance(category, Unset):
    json_category = UNSET
  elif isinstance(category, MuscleCategory):
    json_category = category.value
  else:
    json_category = category
  params["category"] = json_category

  params["page"] = page

  params["limit"] = limit

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/workouts/exercises",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> ExerciseListResponse | HTTPValidationError | None:
  if response.status_code == 200:
    response_200 = ExerciseListResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[ExerciseListResponse | HTTPValidationError]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient | Client,
  q: None | str | Unset = UNSET,
  category: MuscleCategory | None | Unset = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> Response[ExerciseListResponse | HTTPValidationError]:
  """List Exercises

  Args:
      q (None | str | Unset): Search exercises by name.
      category (MuscleCategory | None | Unset): Filter by muscle category.
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[ExerciseListResponse | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    q=q,
    category=category,
    page=page,
    limit=limit,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  *,
  client: AuthenticatedClient | Client,
  q: None | str | Unset = UNSET,
  category: MuscleCategory | None | Unset = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> ExerciseListResponse | HTTPValidationError | None:
  """List Exercises

  Args:
      q (None | str | Unset): Search exercises by name.
      category (MuscleCategory | None | Unset): Filter by muscle category.
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      ExerciseListResponse | HTTPValidationError
  """

  return sync_detailed(
    client=client,
    q=q,
    category=category,
    page=page,
    limit=limit,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient | Client,
  q: None | str | Unset = UNSET,
  category: MuscleCategory | None | Unset = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> Response[ExerciseListResponse | HTTPValidationError]:
  """List Exercises

  Args:
      q (None | str | Unset): Search exercises by name.
      category (MuscleCategory | None | Unset): Filter by muscle category.
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[ExerciseListResponse | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    q=q,
    category=category,
    page=page,
    limit=limit,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient | Client,
  q: None | str | Unset = UNSET,
  category: MuscleCategory | None | Unset = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> ExerciseListResponse | HTTPValidationError | None:
  """List Exercises

  Args:
      q (None | str | Unset): Search exercises by name.
      category (MuscleCategory | None | Unset): Filter by muscle category.
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      ExerciseListResponse | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      client=client,
      q=q,
      category=category,
      page=page,
      limit=limit,
    )
  ).parsed
