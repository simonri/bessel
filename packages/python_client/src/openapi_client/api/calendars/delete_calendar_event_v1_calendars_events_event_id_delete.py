from http import HTTPStatus
from typing import Any, cast
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.edit_scope import EditScope
from ...models.http_validation_error import HTTPValidationError
from ...types import UNSET, Response, Unset


def _get_kwargs(
  event_id: UUID,
  *,
  time_zone: str,
  scope: EditScope | Unset = UNSET,
  notify_guests: bool | Unset = True,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  params["time_zone"] = time_zone

  json_scope: str | Unset = UNSET
  if not isinstance(scope, Unset):
    json_scope = scope.value

  params["scope"] = json_scope

  params["notify_guests"] = notify_guests

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "delete",
    "url": "/v1/calendars/events/{event_id}".format(
      event_id=quote(str(event_id), safe=""),
    ),
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Any | HTTPValidationError | None:
  if response.status_code == 204:
    response_204 = cast(Any, None)
    return response_204

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[Any | HTTPValidationError]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  event_id: UUID,
  *,
  client: AuthenticatedClient,
  time_zone: str,
  scope: EditScope | Unset = UNSET,
  notify_guests: bool | Unset = True,
) -> Response[Any | HTTPValidationError]:
  """Delete Calendar Event

  Args:
      event_id (UUID):
      time_zone (str): Zone the user is viewing the calendar in.
      scope (EditScope | Unset): Which occurrences of a repeating event a change applies to.
      notify_guests (bool | Unset): Email guests a cancellation (Google only). Default: True.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[Any | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    event_id=event_id,
    time_zone=time_zone,
    scope=scope,
    notify_guests=notify_guests,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  event_id: UUID,
  *,
  client: AuthenticatedClient,
  time_zone: str,
  scope: EditScope | Unset = UNSET,
  notify_guests: bool | Unset = True,
) -> Any | HTTPValidationError | None:
  """Delete Calendar Event

  Args:
      event_id (UUID):
      time_zone (str): Zone the user is viewing the calendar in.
      scope (EditScope | Unset): Which occurrences of a repeating event a change applies to.
      notify_guests (bool | Unset): Email guests a cancellation (Google only). Default: True.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Any | HTTPValidationError
  """

  return sync_detailed(
    event_id=event_id,
    client=client,
    time_zone=time_zone,
    scope=scope,
    notify_guests=notify_guests,
  ).parsed


async def asyncio_detailed(
  event_id: UUID,
  *,
  client: AuthenticatedClient,
  time_zone: str,
  scope: EditScope | Unset = UNSET,
  notify_guests: bool | Unset = True,
) -> Response[Any | HTTPValidationError]:
  """Delete Calendar Event

  Args:
      event_id (UUID):
      time_zone (str): Zone the user is viewing the calendar in.
      scope (EditScope | Unset): Which occurrences of a repeating event a change applies to.
      notify_guests (bool | Unset): Email guests a cancellation (Google only). Default: True.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[Any | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    event_id=event_id,
    time_zone=time_zone,
    scope=scope,
    notify_guests=notify_guests,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  event_id: UUID,
  *,
  client: AuthenticatedClient,
  time_zone: str,
  scope: EditScope | Unset = UNSET,
  notify_guests: bool | Unset = True,
) -> Any | HTTPValidationError | None:
  """Delete Calendar Event

  Args:
      event_id (UUID):
      time_zone (str): Zone the user is viewing the calendar in.
      scope (EditScope | Unset): Which occurrences of a repeating event a change applies to.
      notify_guests (bool | Unset): Email guests a cancellation (Google only). Default: True.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Any | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      event_id=event_id,
      client=client,
      time_zone=time_zone,
      scope=scope,
      notify_guests=notify_guests,
    )
  ).parsed
