from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.category_list_response import CategoryListResponse
from ...models.http_validation_error import HTTPValidationError
from ...types import UNSET, Response, Unset


def _get_kwargs(
  *,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  params["page"] = page

  params["limit"] = limit

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/categories",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> CategoryListResponse | HTTPValidationError | None:
  if response.status_code == 200:
    response_200 = CategoryListResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[CategoryListResponse | HTTPValidationError]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient | Client,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> Response[CategoryListResponse | HTTPValidationError]:
  """List Categories

   List all categories.

  Args:
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[CategoryListResponse | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    page=page,
    limit=limit,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  *,
  client: AuthenticatedClient | Client,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> CategoryListResponse | HTTPValidationError | None:
  """List Categories

   List all categories.

  Args:
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      CategoryListResponse | HTTPValidationError
  """

  return sync_detailed(
    client=client,
    page=page,
    limit=limit,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient | Client,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> Response[CategoryListResponse | HTTPValidationError]:
  """List Categories

   List all categories.

  Args:
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[CategoryListResponse | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    page=page,
    limit=limit,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient | Client,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> CategoryListResponse | HTTPValidationError | None:
  """List Categories

   List all categories.

  Args:
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      CategoryListResponse | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      client=client,
      page=page,
      limit=limit,
    )
  ).parsed
