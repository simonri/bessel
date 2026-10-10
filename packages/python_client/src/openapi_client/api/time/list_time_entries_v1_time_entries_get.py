import datetime
from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.time_entry_schema import TimeEntrySchema
from ...types import UNSET, Response


def _get_kwargs(
  *,
  start: datetime.datetime,
  end: datetime.datetime,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  json_start = start.isoformat()
  params["start"] = json_start

  json_end = end.isoformat()
  params["end"] = json_end

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/time/entries",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | list[TimeEntrySchema] | None:
  if response.status_code == 200:
    response_200 = []
    _response_200 = response.json()
    for response_200_item_data in _response_200:
      response_200_item = TimeEntrySchema.from_dict(response_200_item_data)

      response_200.append(response_200_item)

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | list[TimeEntrySchema]]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient,
  start: datetime.datetime,
  end: datetime.datetime,
) -> Response[HTTPValidationError | list[TimeEntrySchema]]:
  """List Time Entries

  Args:
      start (datetime.datetime): Entries ending after this instant.
      end (datetime.datetime): Entries starting before this instant. At most two months after
          start.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | list[TimeEntrySchema]]
  """

  kwargs = _get_kwargs(
    start=start,
    end=end,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  *,
  client: AuthenticatedClient,
  start: datetime.datetime,
  end: datetime.datetime,
) -> HTTPValidationError | list[TimeEntrySchema] | None:
  """List Time Entries

  Args:
      start (datetime.datetime): Entries ending after this instant.
      end (datetime.datetime): Entries starting before this instant. At most two months after
          start.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | list[TimeEntrySchema]
  """

  return sync_detailed(
    client=client,
    start=start,
    end=end,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  start: datetime.datetime,
  end: datetime.datetime,
) -> Response[HTTPValidationError | list[TimeEntrySchema]]:
  """List Time Entries

  Args:
      start (datetime.datetime): Entries ending after this instant.
      end (datetime.datetime): Entries starting before this instant. At most two months after
          start.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | list[TimeEntrySchema]]
  """

  kwargs = _get_kwargs(
    start=start,
    end=end,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  start: datetime.datetime,
  end: datetime.datetime,
) -> HTTPValidationError | list[TimeEntrySchema] | None:
  """List Time Entries

  Args:
      start (datetime.datetime): Entries ending after this instant.
      end (datetime.datetime): Entries starting before this instant. At most two months after
          start.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | list[TimeEntrySchema]
  """

  return (
    await asyncio_detailed(
      client=client,
      start=start,
      end=end,
    )
  ).parsed
