from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.activity_daily_response import ActivityDailyResponse
from ...models.http_validation_error import HTTPValidationError
from ...types import UNSET, Response, Unset


def _get_kwargs(
  *,
  start_ts: int,
  end_ts: int,
  source: str,
  tz_name: None | str | Unset = UNSET,
  tz_offset_mins: int | Unset = 0,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  params["start_ts"] = start_ts

  params["end_ts"] = end_ts

  params["source"] = source

  json_tz_name: None | str | Unset
  if isinstance(tz_name, Unset):
    json_tz_name = UNSET
  else:
    json_tz_name = tz_name
  params["tz_name"] = json_tz_name

  params["tz_offset_mins"] = tz_offset_mins

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/activity/daily",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> ActivityDailyResponse | HTTPValidationError | None:
  if response.status_code == 200:
    response_200 = ActivityDailyResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[ActivityDailyResponse | HTTPValidationError]:
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
  source: str,
  tz_name: None | str | Unset = UNSET,
  tz_offset_mins: int | Unset = 0,
) -> Response[ActivityDailyResponse | HTTPValidationError]:
  """Get Daily Activity Totals

  Args:
      start_ts (int): Start of range (Unix epoch seconds, inclusive).
      end_ts (int): End of range (Unix epoch seconds, exclusive).
      source (str): Machine source to query.
      tz_name (None | str | Unset): IANA timezone name (e.g. 'Europe/Stockholm'). Preferred over
          tz_offset_mins; handles DST correctly.
      tz_offset_mins (int | Unset): Fallback UTC offset in minutes when tz_name is not provided
          (e.g. 120 for UTC+2). Does not handle DST. Default: 0.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[ActivityDailyResponse | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    start_ts=start_ts,
    end_ts=end_ts,
    source=source,
    tz_name=tz_name,
    tz_offset_mins=tz_offset_mins,
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
  source: str,
  tz_name: None | str | Unset = UNSET,
  tz_offset_mins: int | Unset = 0,
) -> ActivityDailyResponse | HTTPValidationError | None:
  """Get Daily Activity Totals

  Args:
      start_ts (int): Start of range (Unix epoch seconds, inclusive).
      end_ts (int): End of range (Unix epoch seconds, exclusive).
      source (str): Machine source to query.
      tz_name (None | str | Unset): IANA timezone name (e.g. 'Europe/Stockholm'). Preferred over
          tz_offset_mins; handles DST correctly.
      tz_offset_mins (int | Unset): Fallback UTC offset in minutes when tz_name is not provided
          (e.g. 120 for UTC+2). Does not handle DST. Default: 0.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      ActivityDailyResponse | HTTPValidationError
  """

  return sync_detailed(
    client=client,
    start_ts=start_ts,
    end_ts=end_ts,
    source=source,
    tz_name=tz_name,
    tz_offset_mins=tz_offset_mins,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  start_ts: int,
  end_ts: int,
  source: str,
  tz_name: None | str | Unset = UNSET,
  tz_offset_mins: int | Unset = 0,
) -> Response[ActivityDailyResponse | HTTPValidationError]:
  """Get Daily Activity Totals

  Args:
      start_ts (int): Start of range (Unix epoch seconds, inclusive).
      end_ts (int): End of range (Unix epoch seconds, exclusive).
      source (str): Machine source to query.
      tz_name (None | str | Unset): IANA timezone name (e.g. 'Europe/Stockholm'). Preferred over
          tz_offset_mins; handles DST correctly.
      tz_offset_mins (int | Unset): Fallback UTC offset in minutes when tz_name is not provided
          (e.g. 120 for UTC+2). Does not handle DST. Default: 0.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[ActivityDailyResponse | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    start_ts=start_ts,
    end_ts=end_ts,
    source=source,
    tz_name=tz_name,
    tz_offset_mins=tz_offset_mins,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  start_ts: int,
  end_ts: int,
  source: str,
  tz_name: None | str | Unset = UNSET,
  tz_offset_mins: int | Unset = 0,
) -> ActivityDailyResponse | HTTPValidationError | None:
  """Get Daily Activity Totals

  Args:
      start_ts (int): Start of range (Unix epoch seconds, inclusive).
      end_ts (int): End of range (Unix epoch seconds, exclusive).
      source (str): Machine source to query.
      tz_name (None | str | Unset): IANA timezone name (e.g. 'Europe/Stockholm'). Preferred over
          tz_offset_mins; handles DST correctly.
      tz_offset_mins (int | Unset): Fallback UTC offset in minutes when tz_name is not provided
          (e.g. 120 for UTC+2). Does not handle DST. Default: 0.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      ActivityDailyResponse | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      client=client,
      start_ts=start_ts,
      end_ts=end_ts,
      source=source,
      tz_name=tz_name,
      tz_offset_mins=tz_offset_mins,
    )
  ).parsed
