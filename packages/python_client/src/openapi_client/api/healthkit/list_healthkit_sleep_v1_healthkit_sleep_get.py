from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.health_kit_sleep_list_response import HealthKitSleepListResponse
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
    "url": "/v1/healthkit/sleep",
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | HealthKitSleepListResponse | None:
  if response.status_code == 200:
    response_200 = HealthKitSleepListResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | HealthKitSleepListResponse]:
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
) -> Response[HTTPValidationError | HealthKitSleepListResponse]:
  """List HealthKit Sleep Samples

  Args:
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | HealthKitSleepListResponse]
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
  client: AuthenticatedClient,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> HTTPValidationError | HealthKitSleepListResponse | None:
  """List HealthKit Sleep Samples

  Args:
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | HealthKitSleepListResponse
  """

  return sync_detailed(
    client=client,
    page=page,
    limit=limit,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> Response[HTTPValidationError | HealthKitSleepListResponse]:
  """List HealthKit Sleep Samples

  Args:
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | HealthKitSleepListResponse]
  """

  kwargs = _get_kwargs(
    page=page,
    limit=limit,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  page: int | Unset = 1,
  limit: int | Unset = 10,
) -> HTTPValidationError | HealthKitSleepListResponse | None:
  """List HealthKit Sleep Samples

  Args:
      page (int | Unset): Page number, defaults to 1. Default: 1.
      limit (int | Unset): Size of a page, defaults to 10. Maximum is 100. Default: 10.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | HealthKitSleepListResponse
  """

  return (
    await asyncio_detailed(
      client=client,
      page=page,
      limit=limit,
    )
  ).parsed
