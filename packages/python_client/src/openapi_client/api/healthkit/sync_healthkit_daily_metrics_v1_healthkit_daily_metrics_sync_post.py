from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.health_kit_daily_metrics_sync_request import HealthKitDailyMetricsSyncRequest
from ...models.health_kit_daily_metrics_sync_response import HealthKitDailyMetricsSyncResponse
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
  *,
  body: HealthKitDailyMetricsSyncRequest,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "post",
    "url": "/v1/healthkit/daily-metrics/sync",
  }

  _kwargs["json"] = body.to_dict()

  headers["Content-Type"] = "application/json"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | HealthKitDailyMetricsSyncResponse | None:
  if response.status_code == 200:
    response_200 = HealthKitDailyMetricsSyncResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | HealthKitDailyMetricsSyncResponse]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient,
  body: HealthKitDailyMetricsSyncRequest,
) -> Response[HTTPValidationError | HealthKitDailyMetricsSyncResponse]:
  """Sync HealthKit Daily Metrics

  Args:
      body (HealthKitDailyMetricsSyncRequest):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | HealthKitDailyMetricsSyncResponse]
  """

  kwargs = _get_kwargs(
    body=body,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  *,
  client: AuthenticatedClient,
  body: HealthKitDailyMetricsSyncRequest,
) -> HTTPValidationError | HealthKitDailyMetricsSyncResponse | None:
  """Sync HealthKit Daily Metrics

  Args:
      body (HealthKitDailyMetricsSyncRequest):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | HealthKitDailyMetricsSyncResponse
  """

  return sync_detailed(
    client=client,
    body=body,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  body: HealthKitDailyMetricsSyncRequest,
) -> Response[HTTPValidationError | HealthKitDailyMetricsSyncResponse]:
  """Sync HealthKit Daily Metrics

  Args:
      body (HealthKitDailyMetricsSyncRequest):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | HealthKitDailyMetricsSyncResponse]
  """

  kwargs = _get_kwargs(
    body=body,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  body: HealthKitDailyMetricsSyncRequest,
) -> HTTPValidationError | HealthKitDailyMetricsSyncResponse | None:
  """Sync HealthKit Daily Metrics

  Args:
      body (HealthKitDailyMetricsSyncRequest):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | HealthKitDailyMetricsSyncResponse
  """

  return (
    await asyncio_detailed(
      client=client,
      body=body,
    )
  ).parsed
