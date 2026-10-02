from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.timeline_response import TimelineResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
  *,
  start_ts: int,
  end_ts: int,
  source: None | str | Unset = UNSET,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  params["start_ts"] = start_ts

  params["end_ts"] = end_ts

  json_source: None | str | Unset
  if isinstance(source, Unset):
    json_source = UNSET
  else:
    json_source = source
  params["source"] = json_source

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/timeline",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | TimelineResponse | None:
  if response.status_code == 200:
    response_200 = TimelineResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | TimelineResponse]:
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
  source: None | str | Unset = UNSET,
) -> Response[HTTPValidationError | TimelineResponse]:
  """Get Timeline

  Args:
      start_ts (int): Start of window (Unix epoch seconds, inclusive).
      end_ts (int): End of window (Unix epoch seconds, exclusive).
      source (None | str | Unset): Activity source for the PC lane. Defaults to the most
          recently active source.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TimelineResponse]
  """

  kwargs = _get_kwargs(
    start_ts=start_ts,
    end_ts=end_ts,
    source=source,
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
  source: None | str | Unset = UNSET,
) -> HTTPValidationError | TimelineResponse | None:
  """Get Timeline

  Args:
      start_ts (int): Start of window (Unix epoch seconds, inclusive).
      end_ts (int): End of window (Unix epoch seconds, exclusive).
      source (None | str | Unset): Activity source for the PC lane. Defaults to the most
          recently active source.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TimelineResponse
  """

  return sync_detailed(
    client=client,
    start_ts=start_ts,
    end_ts=end_ts,
    source=source,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  start_ts: int,
  end_ts: int,
  source: None | str | Unset = UNSET,
) -> Response[HTTPValidationError | TimelineResponse]:
  """Get Timeline

  Args:
      start_ts (int): Start of window (Unix epoch seconds, inclusive).
      end_ts (int): End of window (Unix epoch seconds, exclusive).
      source (None | str | Unset): Activity source for the PC lane. Defaults to the most
          recently active source.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TimelineResponse]
  """

  kwargs = _get_kwargs(
    start_ts=start_ts,
    end_ts=end_ts,
    source=source,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  start_ts: int,
  end_ts: int,
  source: None | str | Unset = UNSET,
) -> HTTPValidationError | TimelineResponse | None:
  """Get Timeline

  Args:
      start_ts (int): Start of window (Unix epoch seconds, inclusive).
      end_ts (int): End of window (Unix epoch seconds, exclusive).
      source (None | str | Unset): Activity source for the PC lane. Defaults to the most
          recently active source.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TimelineResponse
  """

  return (
    await asyncio_detailed(
      client=client,
      start_ts=start_ts,
      end_ts=end_ts,
      source=source,
    )
  ).parsed
