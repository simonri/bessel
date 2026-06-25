import datetime
from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.transaction_list_response import TransactionListResponse
from ...models.transaction_sort_property import TransactionSortProperty
from ...types import UNSET, Response, Unset


def _get_kwargs(
  *,
  bank_account_id: list[UUID] | None | Unset = UNSET,
  category_id: list[UUID] | None | Unset = UNSET,
  uncategorized: bool | Unset = False,
  direction: None | str | Unset = UNSET,
  search: None | str | Unset = UNSET,
  date_from: datetime.date | None | Unset = UNSET,
  date_to: datetime.date | None | Unset = UNSET,
  is_business: bool | None | Unset = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
  sorting: list[TransactionSortProperty] | None | Unset = UNSET,
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  json_bank_account_id: list[str] | None | Unset
  if isinstance(bank_account_id, Unset):
    json_bank_account_id = UNSET
  elif isinstance(bank_account_id, list):
    json_bank_account_id = []
    for bank_account_id_type_0_item_data in bank_account_id:
      bank_account_id_type_0_item = str(bank_account_id_type_0_item_data)
      json_bank_account_id.append(bank_account_id_type_0_item)

  else:
    json_bank_account_id = bank_account_id
  params["bank_account_id"] = json_bank_account_id

  json_category_id: list[str] | None | Unset
  if isinstance(category_id, Unset):
    json_category_id = UNSET
  elif isinstance(category_id, list):
    json_category_id = []
    for category_id_type_0_item_data in category_id:
      category_id_type_0_item = str(category_id_type_0_item_data)
      json_category_id.append(category_id_type_0_item)

  else:
    json_category_id = category_id
  params["category_id"] = json_category_id

  params["uncategorized"] = uncategorized

  json_direction: None | str | Unset
  if isinstance(direction, Unset):
    json_direction = UNSET
  else:
    json_direction = direction
  params["direction"] = json_direction

  json_search: None | str | Unset
  if isinstance(search, Unset):
    json_search = UNSET
  else:
    json_search = search
  params["search"] = json_search

  json_date_from: None | str | Unset
  if isinstance(date_from, Unset):
    json_date_from = UNSET
  elif isinstance(date_from, datetime.date):
    json_date_from = date_from.isoformat()
  else:
    json_date_from = date_from
  params["date_from"] = json_date_from

  json_date_to: None | str | Unset
  if isinstance(date_to, Unset):
    json_date_to = UNSET
  elif isinstance(date_to, datetime.date):
    json_date_to = date_to.isoformat()
  else:
    json_date_to = date_to
  params["date_to"] = json_date_to

  json_is_business: bool | None | Unset
  if isinstance(is_business, Unset):
    json_is_business = UNSET
  else:
    json_is_business = is_business
  params["is_business"] = json_is_business

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
    "url": "/v1/transactions",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | TransactionListResponse | None:
  if response.status_code == 200:
    response_200 = TransactionListResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | TransactionListResponse]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient,
  bank_account_id: list[UUID] | None | Unset = UNSET,
  category_id: list[UUID] | None | Unset = UNSET,
  uncategorized: bool | Unset = False,
  direction: None | str | Unset = UNSET,
  search: None | str | Unset = UNSET,
  date_from: datetime.date | None | Unset = UNSET,
  date_to: datetime.date | None | Unset = UNSET,
  is_business: bool | None | Unset = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
  sorting: list[TransactionSortProperty] | None | Unset = UNSET,
) -> Response[HTTPValidationError | TransactionListResponse]:
  """List Transactions

   List transactions.

  Args:
      bank_account_id (list[UUID] | None | Unset): Filter by bank account ID(s).
      category_id (list[UUID] | None | Unset): Filter by category ID(s).
      uncategorized (bool | Unset): If true, only show transactions without a category. Default:
          False.
      direction (None | str | Unset): Filter by direction: 'debit' or 'credit'.
      search (None | str | Unset): Search in description (case-insensitive).
      date_from (datetime.date | None | Unset): Start date (inclusive).
      date_to (datetime.date | None | Unset): End date (inclusive).
      is_business (bool | None | Unset): Filter by business flag.
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.
      sorting (list[TransactionSortProperty] | None | Unset): Sorting criterion. Several
          criteria can be used simultaneously and will be applied in order. Add a minus sign `-`
          before the criteria name to sort by descending order.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TransactionListResponse]
  """

  kwargs = _get_kwargs(
    bank_account_id=bank_account_id,
    category_id=category_id,
    uncategorized=uncategorized,
    direction=direction,
    search=search,
    date_from=date_from,
    date_to=date_to,
    is_business=is_business,
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
  bank_account_id: list[UUID] | None | Unset = UNSET,
  category_id: list[UUID] | None | Unset = UNSET,
  uncategorized: bool | Unset = False,
  direction: None | str | Unset = UNSET,
  search: None | str | Unset = UNSET,
  date_from: datetime.date | None | Unset = UNSET,
  date_to: datetime.date | None | Unset = UNSET,
  is_business: bool | None | Unset = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
  sorting: list[TransactionSortProperty] | None | Unset = UNSET,
) -> HTTPValidationError | TransactionListResponse | None:
  """List Transactions

   List transactions.

  Args:
      bank_account_id (list[UUID] | None | Unset): Filter by bank account ID(s).
      category_id (list[UUID] | None | Unset): Filter by category ID(s).
      uncategorized (bool | Unset): If true, only show transactions without a category. Default:
          False.
      direction (None | str | Unset): Filter by direction: 'debit' or 'credit'.
      search (None | str | Unset): Search in description (case-insensitive).
      date_from (datetime.date | None | Unset): Start date (inclusive).
      date_to (datetime.date | None | Unset): End date (inclusive).
      is_business (bool | None | Unset): Filter by business flag.
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.
      sorting (list[TransactionSortProperty] | None | Unset): Sorting criterion. Several
          criteria can be used simultaneously and will be applied in order. Add a minus sign `-`
          before the criteria name to sort by descending order.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TransactionListResponse
  """

  return sync_detailed(
    client=client,
    bank_account_id=bank_account_id,
    category_id=category_id,
    uncategorized=uncategorized,
    direction=direction,
    search=search,
    date_from=date_from,
    date_to=date_to,
    is_business=is_business,
    page=page,
    limit=limit,
    sorting=sorting,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  bank_account_id: list[UUID] | None | Unset = UNSET,
  category_id: list[UUID] | None | Unset = UNSET,
  uncategorized: bool | Unset = False,
  direction: None | str | Unset = UNSET,
  search: None | str | Unset = UNSET,
  date_from: datetime.date | None | Unset = UNSET,
  date_to: datetime.date | None | Unset = UNSET,
  is_business: bool | None | Unset = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
  sorting: list[TransactionSortProperty] | None | Unset = UNSET,
) -> Response[HTTPValidationError | TransactionListResponse]:
  """List Transactions

   List transactions.

  Args:
      bank_account_id (list[UUID] | None | Unset): Filter by bank account ID(s).
      category_id (list[UUID] | None | Unset): Filter by category ID(s).
      uncategorized (bool | Unset): If true, only show transactions without a category. Default:
          False.
      direction (None | str | Unset): Filter by direction: 'debit' or 'credit'.
      search (None | str | Unset): Search in description (case-insensitive).
      date_from (datetime.date | None | Unset): Start date (inclusive).
      date_to (datetime.date | None | Unset): End date (inclusive).
      is_business (bool | None | Unset): Filter by business flag.
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.
      sorting (list[TransactionSortProperty] | None | Unset): Sorting criterion. Several
          criteria can be used simultaneously and will be applied in order. Add a minus sign `-`
          before the criteria name to sort by descending order.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TransactionListResponse]
  """

  kwargs = _get_kwargs(
    bank_account_id=bank_account_id,
    category_id=category_id,
    uncategorized=uncategorized,
    direction=direction,
    search=search,
    date_from=date_from,
    date_to=date_to,
    is_business=is_business,
    page=page,
    limit=limit,
    sorting=sorting,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  bank_account_id: list[UUID] | None | Unset = UNSET,
  category_id: list[UUID] | None | Unset = UNSET,
  uncategorized: bool | Unset = False,
  direction: None | str | Unset = UNSET,
  search: None | str | Unset = UNSET,
  date_from: datetime.date | None | Unset = UNSET,
  date_to: datetime.date | None | Unset = UNSET,
  is_business: bool | None | Unset = UNSET,
  page: int | Unset = 1,
  limit: int | Unset = 10,
  sorting: list[TransactionSortProperty] | None | Unset = UNSET,
) -> HTTPValidationError | TransactionListResponse | None:
  """List Transactions

   List transactions.

  Args:
      bank_account_id (list[UUID] | None | Unset): Filter by bank account ID(s).
      category_id (list[UUID] | None | Unset): Filter by category ID(s).
      uncategorized (bool | Unset): If true, only show transactions without a category. Default:
          False.
      direction (None | str | Unset): Filter by direction: 'debit' or 'credit'.
      search (None | str | Unset): Search in description (case-insensitive).
      date_from (datetime.date | None | Unset): Start date (inclusive).
      date_to (datetime.date | None | Unset): End date (inclusive).
      is_business (bool | None | Unset): Filter by business flag.
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.
      sorting (list[TransactionSortProperty] | None | Unset): Sorting criterion. Several
          criteria can be used simultaneously and will be applied in order. Add a minus sign `-`
          before the criteria name to sort by descending order.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TransactionListResponse
  """

  return (
    await asyncio_detailed(
      client=client,
      bank_account_id=bank_account_id,
      category_id=category_id,
      uncategorized=uncategorized,
      direction=direction,
      search=search,
      date_from=date_from,
      date_to=date_to,
      is_business=is_business,
      page=page,
      limit=limit,
      sorting=sorting,
    )
  ).parsed
