from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.bank_account_list_response import BankAccountListResponse
from ...models.bank_account_sort_property import BankAccountSortProperty
from ...models.http_validation_error import HTTPValidationError
from ...types import UNSET, Response, Unset


def _get_kwargs(
  *,
  page: int | Unset = 1,
  limit: int | Unset = 10,
  sorting: list[BankAccountSortProperty] | None | Unset = UNSET,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  params["page"] = page

  params["limit"] = limit

  json_sorting: list[str] | None | Unset
  if isinstance(sorting, Unset):
    json_sorting = UNSET
  elif isinstance(sorting, list):
    json_sorting = []
    for sorting_type_0_item_data in sorting:
      sorting_type_0_item = sorting_type_0_item_data.value
      json_sorting.append(sorting_type_0_item)

  else:
    json_sorting = sorting
  params["sorting"] = json_sorting

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/bank-accounts",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> BankAccountListResponse | HTTPValidationError | None:
  if response.status_code == 200:
    response_200 = BankAccountListResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[BankAccountListResponse | HTTPValidationError]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient,
  page: int | Unset = 1,
  limit: int | Unset = 10,
  sorting: list[BankAccountSortProperty] | None | Unset = UNSET,
) -> Response[BankAccountListResponse | HTTPValidationError]:
  """List Bank Accounts

   List all bank accounts.

  Args:
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.
      sorting (list[BankAccountSortProperty] | None | Unset): Sorting criterion. Several
          criteria can be used simultaneously and will be applied in order. Add a minus sign `-`
          before the criteria name to sort by descending order.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[BankAccountListResponse | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    page=page,
    limit=limit,
    sorting=sorting,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  *,
  client: AuthenticatedClient,
  page: int | Unset = 1,
  limit: int | Unset = 10,
  sorting: list[BankAccountSortProperty] | None | Unset = UNSET,
) -> BankAccountListResponse | HTTPValidationError | None:
  """List Bank Accounts

   List all bank accounts.

  Args:
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.
      sorting (list[BankAccountSortProperty] | None | Unset): Sorting criterion. Several
          criteria can be used simultaneously and will be applied in order. Add a minus sign `-`
          before the criteria name to sort by descending order.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      BankAccountListResponse | HTTPValidationError
  """

  return sync_detailed(
    client=client,
    page=page,
    limit=limit,
    sorting=sorting,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  page: int | Unset = 1,
  limit: int | Unset = 10,
  sorting: list[BankAccountSortProperty] | None | Unset = UNSET,
) -> Response[BankAccountListResponse | HTTPValidationError]:
  """List Bank Accounts

   List all bank accounts.

  Args:
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.
      sorting (list[BankAccountSortProperty] | None | Unset): Sorting criterion. Several
          criteria can be used simultaneously and will be applied in order. Add a minus sign `-`
          before the criteria name to sort by descending order.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[BankAccountListResponse | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    page=page,
    limit=limit,
    sorting=sorting,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  page: int | Unset = 1,
  limit: int | Unset = 10,
  sorting: list[BankAccountSortProperty] | None | Unset = UNSET,
) -> BankAccountListResponse | HTTPValidationError | None:
  """List Bank Accounts

   List all bank accounts.

  Args:
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.
      sorting (list[BankAccountSortProperty] | None | Unset): Sorting criterion. Several
          criteria can be used simultaneously and will be applied in order. Add a minus sign `-`
          before the criteria name to sort by descending order.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      BankAccountListResponse | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      client=client,
      page=page,
      limit=limit,
      sorting=sorting,
    )
  ).parsed
