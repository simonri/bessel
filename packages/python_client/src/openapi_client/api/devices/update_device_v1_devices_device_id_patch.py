from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.device_schema import DeviceSchema
from ...models.device_update import DeviceUpdate
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
  device_id: UUID,
  *,
  body: DeviceUpdate,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "patch",
    "url": "/v1/devices/{device_id}".format(
      device_id=quote(str(device_id), safe=""),
    ),
  }

  _kwargs["json"] = body.to_dict()

  headers["Content-Type"] = "application/json"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> DeviceSchema | HTTPValidationError | None:
  if response.status_code == 200:
    response_200 = DeviceSchema.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[DeviceSchema | HTTPValidationError]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  device_id: UUID,
  *,
  client: AuthenticatedClient,
  body: DeviceUpdate,
) -> Response[DeviceSchema | HTTPValidationError]:
  """Rename Device

  Args:
      device_id (UUID):
      body (DeviceUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[DeviceSchema | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    device_id=device_id,
    body=body,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  device_id: UUID,
  *,
  client: AuthenticatedClient,
  body: DeviceUpdate,
) -> DeviceSchema | HTTPValidationError | None:
  """Rename Device

  Args:
      device_id (UUID):
      body (DeviceUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      DeviceSchema | HTTPValidationError
  """

  return sync_detailed(
    device_id=device_id,
    client=client,
    body=body,
  ).parsed


async def asyncio_detailed(
  device_id: UUID,
  *,
  client: AuthenticatedClient,
  body: DeviceUpdate,
) -> Response[DeviceSchema | HTTPValidationError]:
  """Rename Device

  Args:
      device_id (UUID):
      body (DeviceUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[DeviceSchema | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    device_id=device_id,
    body=body,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  device_id: UUID,
  *,
  client: AuthenticatedClient,
  body: DeviceUpdate,
) -> DeviceSchema | HTTPValidationError | None:
  """Rename Device

  Args:
      device_id (UUID):
      body (DeviceUpdate):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      DeviceSchema | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      device_id=device_id,
      client=client,
      body=body,
    )
  ).parsed
