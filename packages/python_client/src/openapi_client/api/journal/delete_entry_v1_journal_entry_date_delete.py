import datetime
from http import HTTPStatus
from typing import Any, cast
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
  entry_date: datetime.date,
) -> dict[str, Any]:

  _kwargs: dict[str, Any] = {
    "method": "delete",
    "url": "/v1/journal/{entry_date}".format(
      entry_date=quote(str(entry_date), safe=""),
    ),
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
  entry_date: datetime.date,
  *,
  client: AuthenticatedClient | Client,
) -> Response[Any | HTTPValidationError]:
  """Delete Journal Entry

  Args:
      entry_date (datetime.date):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[Any | HTTPValidationError]
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
) -> Any | HTTPValidationError | None:
  """Delete Journal Entry

  Args:
      entry_date (datetime.date):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Any | HTTPValidationError
  """

  return sync_detailed(
    entry_date=entry_date,
    client=client,
  ).parsed


async def asyncio_detailed(
  entry_date: datetime.date,
  *,
  client: AuthenticatedClient | Client,
) -> Response[Any | HTTPValidationError]:
  """Delete Journal Entry

  Args:
      entry_date (datetime.date):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[Any | HTTPValidationError]
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
) -> Any | HTTPValidationError | None:
  """Delete Journal Entry

  Args:
      entry_date (datetime.date):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Any | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      entry_date=entry_date,
      client=client,
    )
  ).parsed
