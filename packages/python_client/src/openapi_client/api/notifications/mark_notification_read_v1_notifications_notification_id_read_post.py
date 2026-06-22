from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.notification_response import NotificationResponse
from ...types import Response


def _get_kwargs(
  notification_id: UUID,
) -> dict[str, Any]:

  _kwargs: dict[str, Any] = {
    "method": "post",
    "url": "/v1/notifications/{notification_id}/read".format(
      notification_id=quote(str(notification_id), safe=""),
    ),
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | NotificationResponse | None:
  if response.status_code == 200:
    response_200 = NotificationResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | NotificationResponse]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  notification_id: UUID,
  *,
  client: AuthenticatedClient | Client,
) -> Response[HTTPValidationError | NotificationResponse]:
  """Mark Notification Read

  Args:
      notification_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | NotificationResponse]
  """

  kwargs = _get_kwargs(
    notification_id=notification_id,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  notification_id: UUID,
  *,
  client: AuthenticatedClient | Client,
) -> HTTPValidationError | NotificationResponse | None:
  """Mark Notification Read

  Args:
      notification_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | NotificationResponse
  """

  return sync_detailed(
    notification_id=notification_id,
    client=client,
  ).parsed


async def asyncio_detailed(
  notification_id: UUID,
  *,
  client: AuthenticatedClient | Client,
) -> Response[HTTPValidationError | NotificationResponse]:
  """Mark Notification Read

  Args:
      notification_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | NotificationResponse]
  """

  kwargs = _get_kwargs(
    notification_id=notification_id,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  notification_id: UUID,
  *,
  client: AuthenticatedClient | Client,
) -> HTTPValidationError | NotificationResponse | None:
  """Mark Notification Read

  Args:
      notification_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | NotificationResponse
  """

  return (
    await asyncio_detailed(
      notification_id=notification_id,
      client=client,
    )
  ).parsed
