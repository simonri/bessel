import datetime
from http import HTTPStatus
from typing import Any, cast
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.journal_entry_schema import JournalEntrySchema
from ...types import Response


def _get_kwargs(
  entry_date: datetime.date,
) -> dict[str, Any]:

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/journal/{entry_date}".format(
      entry_date=quote(str(entry_date), safe=""),
    ),
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | JournalEntrySchema | None | None:
  if response.status_code == 200:

    def _parse_response_200(data: object) -> JournalEntrySchema | None:
      if data is None:
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        response_200_type_0 = JournalEntrySchema.from_dict(data)

        return response_200_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(JournalEntrySchema | None, data)

    response_200 = _parse_response_200(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | JournalEntrySchema | None]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  entry_date: datetime.date,
  *,
  client: AuthenticatedClient | Client,
) -> Response[HTTPValidationError | JournalEntrySchema | None]:
  """Get Journal Entry

  Args:
      entry_date (datetime.date):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | JournalEntrySchema | None]
  """

  kwargs = _get_kwargs(
    entry_date=entry_date,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  entry_date: datetime.date,
  *,
  client: AuthenticatedClient | Client,
) -> HTTPValidationError | JournalEntrySchema | None | None:
  """Get Journal Entry

  Args:
      entry_date (datetime.date):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | JournalEntrySchema | None
  """

  return sync_detailed(
    entry_date=entry_date,
    client=client,
  ).parsed


async def asyncio_detailed(
  entry_date: datetime.date,
  *,
  client: AuthenticatedClient | Client,
) -> Response[HTTPValidationError | JournalEntrySchema | None]:
  """Get Journal Entry

  Args:
      entry_date (datetime.date):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | JournalEntrySchema | None]
  """

  kwargs = _get_kwargs(
    entry_date=entry_date,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  entry_date: datetime.date,
  *,
  client: AuthenticatedClient | Client,
) -> HTTPValidationError | JournalEntrySchema | None | None:
  """Get Journal Entry

  Args:
      entry_date (datetime.date):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | JournalEntrySchema | None
  """

  return (
    await asyncio_detailed(
      entry_date=entry_date,
      client=client,
    )
  ).parsed
