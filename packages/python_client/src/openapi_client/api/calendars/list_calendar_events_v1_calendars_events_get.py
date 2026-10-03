from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.calendar_event_list_response import CalendarEventListResponse
from ...models.http_validation_error import HTTPValidationError
from ...types import UNSET, Response


def _get_kwargs(
  *,
  start_ts: int,
  end_ts: int,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  params["start_ts"] = start_ts

  params["end_ts"] = end_ts

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/calendars/events",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> CalendarEventListResponse | HTTPValidationError | None:
  if response.status_code == 200:
    response_200 = CalendarEventListResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[CalendarEventListResponse | HTTPValidationError]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient,
  start_ts: int,
  end_ts: int,
) -> Response[CalendarEventListResponse | HTTPValidationError]:
  """List Calendar Events

  Args:
      start_ts (int): Start of window (Unix epoch seconds, inclusive).
      end_ts (int): End of window (Unix epoch seconds, exclusive).

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[CalendarEventListResponse | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    start_ts=start_ts,
    end_ts=end_ts,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  *,
  client: AuthenticatedClient,
  start_ts: int,
  end_ts: int,
) -> CalendarEventListResponse | HTTPValidationError | None:
  """List Calendar Events

  Args:
      start_ts (int): Start of window (Unix epoch seconds, inclusive).
      end_ts (int): End of window (Unix epoch seconds, exclusive).

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      CalendarEventListResponse | HTTPValidationError
  """

  return sync_detailed(
    client=client,
    start_ts=start_ts,
    end_ts=end_ts,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  start_ts: int,
  end_ts: int,
) -> Response[CalendarEventListResponse | HTTPValidationError]:
  """List Calendar Events

  Args:
      start_ts (int): Start of window (Unix epoch seconds, inclusive).
      end_ts (int): End of window (Unix epoch seconds, exclusive).

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[CalendarEventListResponse | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    start_ts=start_ts,
    end_ts=end_ts,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  start_ts: int,
  end_ts: int,
) -> CalendarEventListResponse | HTTPValidationError | None:
  """List Calendar Events

  Args:
      start_ts (int): Start of window (Unix epoch seconds, inclusive).
      end_ts (int): End of window (Unix epoch seconds, exclusive).

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      CalendarEventListResponse | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      client=client,
      start_ts=start_ts,
      end_ts=end_ts,
    )
  ).parsed
