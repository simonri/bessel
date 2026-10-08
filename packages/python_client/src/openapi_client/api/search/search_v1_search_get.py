from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.search_response import SearchResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
  *,
  q: str,
  limit: int | Unset = 5,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  params["q"] = q

  params["limit"] = limit

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/search",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | SearchResponse | None:
  if response.status_code == 200:
    response_200 = SearchResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | SearchResponse]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient,
  q: str,
  limit: int | Unset = 5,
) -> Response[HTTPValidationError | SearchResponse]:
  """Search

   Tasks, recipes, calendar events and saved places matching `q`, for the command palette.

  Args:
      q (str): Text to look for in titles, notes and names.
      limit (int | Unset): Most results per kind. Default: 5.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | SearchResponse]
  """

  kwargs = _get_kwargs(
    q=q,
    limit=limit,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  *,
  client: AuthenticatedClient,
  q: str,
  limit: int | Unset = 5,
) -> HTTPValidationError | SearchResponse | None:
  """Search

   Tasks, recipes, calendar events and saved places matching `q`, for the command palette.

  Args:
      q (str): Text to look for in titles, notes and names.
      limit (int | Unset): Most results per kind. Default: 5.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | SearchResponse
  """

  return sync_detailed(
    client=client,
    q=q,
    limit=limit,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  q: str,
  limit: int | Unset = 5,
) -> Response[HTTPValidationError | SearchResponse]:
  """Search

   Tasks, recipes, calendar events and saved places matching `q`, for the command palette.

  Args:
      q (str): Text to look for in titles, notes and names.
      limit (int | Unset): Most results per kind. Default: 5.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | SearchResponse]
  """

  kwargs = _get_kwargs(
    q=q,
    limit=limit,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  q: str,
  limit: int | Unset = 5,
) -> HTTPValidationError | SearchResponse | None:
  """Search

   Tasks, recipes, calendar events and saved places matching `q`, for the command palette.

  Args:
      q (str): Text to look for in titles, notes and names.
      limit (int | Unset): Most results per kind. Default: 5.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | SearchResponse
  """

  return (
    await asyncio_detailed(
      client=client,
      q=q,
      limit=limit,
    )
  ).parsed
