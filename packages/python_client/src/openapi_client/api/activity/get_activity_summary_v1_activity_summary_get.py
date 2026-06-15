from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.activity_summary_response import ActivitySummaryResponse
from ...models.http_validation_error import HTTPValidationError
from ...types import UNSET, Response


def _get_kwargs(
  *,
  start_ts: int,
  end_ts: int,
  source: str,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  params["start_ts"] = start_ts

  params["end_ts"] = end_ts

  params["source"] = source

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/activity/summary",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> ActivitySummaryResponse | HTTPValidationError | None:
  if response.status_code == 200:
    response_200 = ActivitySummaryResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[ActivitySummaryResponse | HTTPValidationError]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient | Client,
  start_ts: int,
  end_ts: int,
  source: str,
) -> Response[ActivitySummaryResponse | HTTPValidationError]:
  """Get Activity Summary

  Args:
      start_ts (int): Start of time window (Unix epoch seconds, inclusive).
      end_ts (int): End of time window (Unix epoch seconds, exclusive).
      source (str): Machine source to query.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[ActivitySummaryResponse | HTTPValidationError]
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
  client: AuthenticatedClient | Client,
  start_ts: int,
  end_ts: int,
  source: str,
) -> ActivitySummaryResponse | HTTPValidationError | None:
  """Get Activity Summary

  Args:
      start_ts (int): Start of time window (Unix epoch seconds, inclusive).
      end_ts (int): End of time window (Unix epoch seconds, exclusive).
      source (str): Machine source to query.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      ActivitySummaryResponse | HTTPValidationError
  """

  return sync_detailed(
    client=client,
    start_ts=start_ts,
    end_ts=end_ts,
    source=source,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient | Client,
  start_ts: int,
  end_ts: int,
  source: str,
) -> Response[ActivitySummaryResponse | HTTPValidationError]:
  """Get Activity Summary

  Args:
      start_ts (int): Start of time window (Unix epoch seconds, inclusive).
      end_ts (int): End of time window (Unix epoch seconds, exclusive).
      source (str): Machine source to query.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[ActivitySummaryResponse | HTTPValidationError]
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
  client: AuthenticatedClient | Client,
  start_ts: int,
  end_ts: int,
  source: str,
) -> ActivitySummaryResponse | HTTPValidationError | None:
  """Get Activity Summary

  Args:
      start_ts (int): Start of time window (Unix epoch seconds, inclusive).
      end_ts (int): End of time window (Unix epoch seconds, exclusive).
      source (str): Machine source to query.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      ActivitySummaryResponse | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      client=client,
      start_ts=start_ts,
      end_ts=end_ts,
      source=source,
    )
  ).parsed
