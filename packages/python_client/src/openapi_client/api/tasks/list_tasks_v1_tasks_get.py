from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.task_list_response import TaskListResponse
from ...models.task_sort_property import TaskSortProperty
from ...models.task_status import TaskStatus
from ...types import UNSET, Response, Unset


def _get_kwargs(
  *,
  status: list[TaskStatus] | None | Unset = UNSET,
  priority: int | None | Unset = UNSET,
  project: None | str | Unset = UNSET,
  area: None | str | Unset = UNSET,
  is_recurring: bool | None | Unset = UNSET,
  completed_after: int | None | Unset = UNSET,
  completed_before: int | None | Unset = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
  sorting: list[TaskSortProperty] | None | Unset = UNSET,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  json_status: list[str] | None | Unset
  if isinstance(status, Unset):
    json_status = UNSET
  elif isinstance(status, list):
    json_status = []
    for status_type_0_item_data in status:
      status_type_0_item = status_type_0_item_data.value
      json_status.append(status_type_0_item)

  else:
    json_status = status
  params["status"] = json_status

  json_priority: int | None | Unset
  if isinstance(priority, Unset):
    json_priority = UNSET
  else:
    json_priority = priority
  params["priority"] = json_priority

  json_project: None | str | Unset
  if isinstance(project, Unset):
    json_project = UNSET
  else:
    json_project = project
  params["project"] = json_project

  json_area: None | str | Unset
  if isinstance(area, Unset):
    json_area = UNSET
  else:
    json_area = area
  params["area"] = json_area

  json_is_recurring: bool | None | Unset
  if isinstance(is_recurring, Unset):
    json_is_recurring = UNSET
  else:
    json_is_recurring = is_recurring
  params["is_recurring"] = json_is_recurring

  json_completed_after: int | None | Unset
  if isinstance(completed_after, Unset):
    json_completed_after = UNSET
  else:
    json_completed_after = completed_after
  params["completed_after"] = json_completed_after

  json_completed_before: int | None | Unset
  if isinstance(completed_before, Unset):
    json_completed_before = UNSET
  else:
    json_completed_before = completed_before
  params["completed_before"] = json_completed_before

  params["page"] = page

  params["limit"] = limit

  json_sorting: list[str] | None | Unset
  if isinstance(sorting, Unset):
    json_sorting = UNSET
  elif isinstance(sorting, list):
    json_sorting = []
    for sorting_type_0_item_data in sorting:
      sorting_type_0_item = sorting_type_0_item_data.value
      json_sorting.append(sorting_type_0_item)

  else:
    json_sorting = sorting
  params["sorting"] = json_sorting

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/tasks",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | TaskListResponse | None:
  if response.status_code == 200:
    response_200 = TaskListResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | TaskListResponse]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient,
  status: list[TaskStatus] | None | Unset = UNSET,
  priority: int | None | Unset = UNSET,
  project: None | str | Unset = UNSET,
  area: None | str | Unset = UNSET,
  is_recurring: bool | None | Unset = UNSET,
  completed_after: int | None | Unset = UNSET,
  completed_before: int | None | Unset = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
  sorting: list[TaskSortProperty] | None | Unset = UNSET,
) -> Response[HTTPValidationError | TaskListResponse]:
  """List Tasks

  Args:
      status (list[TaskStatus] | None | Unset): Filter by status. Repeat to filter by multiple.
      priority (int | None | Unset): Filter by priority.
      project (None | str | Unset): Filter by project.
      area (None | str | Unset): Filter by area.
      is_recurring (bool | None | Unset): Filter by recurring.
      completed_after (int | None | Unset): Filter tasks completed after this Unix timestamp
          (inclusive).
      completed_before (int | None | Unset): Filter tasks completed before this Unix timestamp
          (exclusive).
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.
      sorting (list[TaskSortProperty] | None | Unset): Sorting criterion. Several criteria can
          be used simultaneously and will be applied in order. Add a minus sign `-` before the
          criteria name to sort by descending order.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TaskListResponse]
  """

  kwargs = _get_kwargs(
    status=status,
    priority=priority,
    project=project,
    area=area,
    is_recurring=is_recurring,
    completed_after=completed_after,
    completed_before=completed_before,
    page=page,
    limit=limit,
    sorting=sorting,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  *,
  client: AuthenticatedClient,
  status: list[TaskStatus] | None | Unset = UNSET,
  priority: int | None | Unset = UNSET,
  project: None | str | Unset = UNSET,
  area: None | str | Unset = UNSET,
  is_recurring: bool | None | Unset = UNSET,
  completed_after: int | None | Unset = UNSET,
  completed_before: int | None | Unset = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
  sorting: list[TaskSortProperty] | None | Unset = UNSET,
) -> HTTPValidationError | TaskListResponse | None:
  """List Tasks

  Args:
      status (list[TaskStatus] | None | Unset): Filter by status. Repeat to filter by multiple.
      priority (int | None | Unset): Filter by priority.
      project (None | str | Unset): Filter by project.
      area (None | str | Unset): Filter by area.
      is_recurring (bool | None | Unset): Filter by recurring.
      completed_after (int | None | Unset): Filter tasks completed after this Unix timestamp
          (inclusive).
      completed_before (int | None | Unset): Filter tasks completed before this Unix timestamp
          (exclusive).
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.
      sorting (list[TaskSortProperty] | None | Unset): Sorting criterion. Several criteria can
          be used simultaneously and will be applied in order. Add a minus sign `-` before the
          criteria name to sort by descending order.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TaskListResponse
  """

  return sync_detailed(
    client=client,
    status=status,
    priority=priority,
    project=project,
    area=area,
    is_recurring=is_recurring,
    completed_after=completed_after,
    completed_before=completed_before,
    page=page,
    limit=limit,
    sorting=sorting,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  status: list[TaskStatus] | None | Unset = UNSET,
  priority: int | None | Unset = UNSET,
  project: None | str | Unset = UNSET,
  area: None | str | Unset = UNSET,
  is_recurring: bool | None | Unset = UNSET,
  completed_after: int | None | Unset = UNSET,
  completed_before: int | None | Unset = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
  sorting: list[TaskSortProperty] | None | Unset = UNSET,
) -> Response[HTTPValidationError | TaskListResponse]:
  """List Tasks

  Args:
      status (list[TaskStatus] | None | Unset): Filter by status. Repeat to filter by multiple.
      priority (int | None | Unset): Filter by priority.
      project (None | str | Unset): Filter by project.
      area (None | str | Unset): Filter by area.
      is_recurring (bool | None | Unset): Filter by recurring.
      completed_after (int | None | Unset): Filter tasks completed after this Unix timestamp
          (inclusive).
      completed_before (int | None | Unset): Filter tasks completed before this Unix timestamp
          (exclusive).
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.
      sorting (list[TaskSortProperty] | None | Unset): Sorting criterion. Several criteria can
          be used simultaneously and will be applied in order. Add a minus sign `-` before the
          criteria name to sort by descending order.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TaskListResponse]
  """

  kwargs = _get_kwargs(
    status=status,
    priority=priority,
    project=project,
    area=area,
    is_recurring=is_recurring,
    completed_after=completed_after,
    completed_before=completed_before,
    page=page,
    limit=limit,
    sorting=sorting,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  status: list[TaskStatus] | None | Unset = UNSET,
  priority: int | None | Unset = UNSET,
  project: None | str | Unset = UNSET,
  area: None | str | Unset = UNSET,
  is_recurring: bool | None | Unset = UNSET,
  completed_after: int | None | Unset = UNSET,
  completed_before: int | None | Unset = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
  sorting: list[TaskSortProperty] | None | Unset = UNSET,
) -> HTTPValidationError | TaskListResponse | None:
  """List Tasks

  Args:
      status (list[TaskStatus] | None | Unset): Filter by status. Repeat to filter by multiple.
      priority (int | None | Unset): Filter by priority.
      project (None | str | Unset): Filter by project.
      area (None | str | Unset): Filter by area.
      is_recurring (bool | None | Unset): Filter by recurring.
      completed_after (int | None | Unset): Filter tasks completed after this Unix timestamp
          (inclusive).
      completed_before (int | None | Unset): Filter tasks completed before this Unix timestamp
          (exclusive).
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.
      sorting (list[TaskSortProperty] | None | Unset): Sorting criterion. Several criteria can
          be used simultaneously and will be applied in order. Add a minus sign `-` before the
          criteria name to sort by descending order.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TaskListResponse
  """

  return (
    await asyncio_detailed(
      client=client,
      status=status,
      priority=priority,
      project=project,
      area=area,
      is_recurring=is_recurring,
      completed_after=completed_after,
      completed_before=completed_before,
      page=page,
      limit=limit,
      sorting=sorting,
    )
  ).parsed
