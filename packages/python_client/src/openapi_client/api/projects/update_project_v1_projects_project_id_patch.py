from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.project_schema import ProjectSchema
from ...models.project_update import ProjectUpdate
from ...types import UNSET, Response, Unset


def _get_kwargs(
  project_id: UUID,
  *,
  body: ProjectUpdate,
  x_device_id: None | str | Unset = UNSET,
  x_device_name: None | str | Unset = UNSET,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}
  if not isinstance(x_device_id, Unset):
    headers["x-device-id"] = x_device_id

  if not isinstance(x_device_name, Unset):
    headers["x-device-name"] = x_device_name

  _kwargs: dict[str, Any] = {
    "method": "patch",
    "url": "/v1/projects/{project_id}".format(
      project_id=quote(str(project_id), safe=""),
    ),
  }

  _kwargs["json"] = body.to_dict()

  headers["Content-Type"] = "application/json"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | ProjectSchema | None:
  if response.status_code == 200:
    response_200 = ProjectSchema.from_dict(response.json())

    return response_200

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
  project_id: UUID,
  *,
  client: AuthenticatedClient,
  body: ProjectUpdate,
  x_device_id: None | str | Unset = UNSET,
  x_device_name: None | str | Unset = UNSET,
) -> Response[HTTPValidationError | ProjectSchema]:
  """Update Project

  Args:
      project_id (UUID):
      x_device_id (None | str | Unset):
      x_device_name (None | str | Unset):
      body (ProjectUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | ProjectSchema]
  """

  kwargs = _get_kwargs(
    project_id=project_id,
    body=body,
    x_device_id=x_device_id,
    x_device_name=x_device_name,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  project_id: UUID,
  *,
  client: AuthenticatedClient,
  body: ProjectUpdate,
  x_device_id: None | str | Unset = UNSET,
  x_device_name: None | str | Unset = UNSET,
) -> HTTPValidationError | ProjectSchema | None:
  """Update Project

  Args:
      project_id (UUID):
      x_device_id (None | str | Unset):
      x_device_name (None | str | Unset):
      body (ProjectUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | ProjectSchema
  """

  return sync_detailed(
    project_id=project_id,
    client=client,
    body=body,
    x_device_id=x_device_id,
    x_device_name=x_device_name,
  ).parsed


async def asyncio_detailed(
  project_id: UUID,
  *,
  client: AuthenticatedClient,
  body: ProjectUpdate,
  x_device_id: None | str | Unset = UNSET,
  x_device_name: None | str | Unset = UNSET,
) -> Response[HTTPValidationError | ProjectSchema]:
  """Update Project

  Args:
      project_id (UUID):
      x_device_id (None | str | Unset):
      x_device_name (None | str | Unset):
      body (ProjectUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | ProjectSchema]
  """

  kwargs = _get_kwargs(
    project_id=project_id,
    body=body,
    x_device_id=x_device_id,
    x_device_name=x_device_name,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  project_id: UUID,
  *,
  client: AuthenticatedClient,
  body: ProjectUpdate,
  x_device_id: None | str | Unset = UNSET,
  x_device_name: None | str | Unset = UNSET,
) -> HTTPValidationError | ProjectSchema | None:
  """Update Project

  Args:
      project_id (UUID):
      x_device_id (None | str | Unset):
      x_device_name (None | str | Unset):
      body (ProjectUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | ProjectSchema
  """

  return (
    await asyncio_detailed(
      project_id=project_id,
      client=client,
      body=body,
      x_device_id=x_device_id,
      x_device_name=x_device_name,
    )
  ).parsed
