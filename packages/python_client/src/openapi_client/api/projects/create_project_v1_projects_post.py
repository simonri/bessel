from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.project_create import ProjectCreate
from ...models.project_schema import ProjectSchema
from ...types import UNSET, Response, Unset


def _get_kwargs(
  *,
  body: ProjectCreate,
  x_device_id: None | str | Unset = UNSET,
  x_device_name: None | str | Unset = UNSET,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}
  if not isinstance(x_device_id, Unset):
    headers["x-device-id"] = x_device_id

  if not isinstance(x_device_name, Unset):
    headers["x-device-name"] = x_device_name

  _kwargs: dict[str, Any] = {
    "method": "post",
    "url": "/v1/projects",
  }

  _kwargs["json"] = body.to_dict()

  headers["Content-Type"] = "application/json"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | ProjectSchema | None:
  if response.status_code == 201:
    response_201 = ProjectSchema.from_dict(response.json())

    return response_201

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | ProjectSchema]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient,
  body: ProjectCreate,
  x_device_id: None | str | Unset = UNSET,
  x_device_name: None | str | Unset = UNSET,
) -> Response[HTTPValidationError | ProjectSchema]:
  """Create Project

  Args:
      x_device_id (None | str | Unset):
      x_device_name (None | str | Unset):
      body (ProjectCreate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | ProjectSchema]
  """

  kwargs = _get_kwargs(
    body=body,
    x_device_id=x_device_id,
    x_device_name=x_device_name,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  *,
  client: AuthenticatedClient,
  body: ProjectCreate,
  x_device_id: None | str | Unset = UNSET,
  x_device_name: None | str | Unset = UNSET,
) -> HTTPValidationError | ProjectSchema | None:
  """Create Project

  Args:
      x_device_id (None | str | Unset):
      x_device_name (None | str | Unset):
      body (ProjectCreate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | ProjectSchema
  """

  return sync_detailed(
    client=client,
    body=body,
    x_device_id=x_device_id,
    x_device_name=x_device_name,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  body: ProjectCreate,
  x_device_id: None | str | Unset = UNSET,
  x_device_name: None | str | Unset = UNSET,
) -> Response[HTTPValidationError | ProjectSchema]:
  """Create Project

  Args:
      x_device_id (None | str | Unset):
      x_device_name (None | str | Unset):
      body (ProjectCreate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | ProjectSchema]
  """

  kwargs = _get_kwargs(
    body=body,
    x_device_id=x_device_id,
    x_device_name=x_device_name,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  body: ProjectCreate,
  x_device_id: None | str | Unset = UNSET,
  x_device_name: None | str | Unset = UNSET,
) -> HTTPValidationError | ProjectSchema | None:
  """Create Project

  Args:
      x_device_id (None | str | Unset):
      x_device_name (None | str | Unset):
      body (ProjectCreate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | ProjectSchema
  """

  return (
    await asyncio_detailed(
      client=client,
      body=body,
      x_device_id=x_device_id,
      x_device_name=x_device_name,
    )
  ).parsed
