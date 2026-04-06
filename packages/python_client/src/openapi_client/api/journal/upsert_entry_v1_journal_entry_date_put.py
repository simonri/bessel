import datetime
from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.journal_entry_schema import JournalEntrySchema
from ...models.journal_entry_upsert import JournalEntryUpsert
from ...types import Response


def _get_kwargs(
  entry_date: datetime.date,
  *,
  body: JournalEntryUpsert,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "put",
    "url": "/v1/journal/{entry_date}".format(
      entry_date=quote(str(entry_date), safe=""),
    ),
  }

  _kwargs["json"] = body.to_dict()

  headers["Content-Type"] = "application/json"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | JournalEntrySchema | None:
  if response.status_code == 200:
    response_200 = JournalEntrySchema.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | JournalEntrySchema]:
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
  body: JournalEntryUpsert,
) -> Response[HTTPValidationError | JournalEntrySchema]:
  """Upsert Journal Entry

  Args:
      entry_date (datetime.date):
      body (JournalEntryUpsert):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | JournalEntrySchema]
  """

  kwargs = _get_kwargs(
    entry_date=entry_date,
    body=body,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  entry_date: datetime.date,
  *,
  client: AuthenticatedClient | Client,
  body: JournalEntryUpsert,
) -> HTTPValidationError | JournalEntrySchema | None:
  """Upsert Journal Entry

  Args:
      entry_date (datetime.date):
      body (JournalEntryUpsert):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | JournalEntrySchema
  """

  return sync_detailed(
    entry_date=entry_date,
    client=client,
    body=body,
  ).parsed


async def asyncio_detailed(
  entry_date: datetime.date,
  *,
  client: AuthenticatedClient | Client,
  body: JournalEntryUpsert,
) -> Response[HTTPValidationError | JournalEntrySchema]:
  """Upsert Journal Entry

  Args:
      entry_date (datetime.date):
      body (JournalEntryUpsert):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | JournalEntrySchema]
  """

  kwargs = _get_kwargs(
    entry_date=entry_date,
    body=body,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  entry_date: datetime.date,
  *,
  client: AuthenticatedClient | Client,
  body: JournalEntryUpsert,
) -> HTTPValidationError | JournalEntrySchema | None:
  """Upsert Journal Entry

  Args:
      entry_date (datetime.date):
      body (JournalEntryUpsert):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | JournalEntrySchema
  """

  return (
    await asyncio_detailed(
      entry_date=entry_date,
      client=client,
      body=body,
    )
  ).parsed
