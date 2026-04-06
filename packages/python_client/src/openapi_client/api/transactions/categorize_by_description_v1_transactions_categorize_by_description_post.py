from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.bulk_categorize_request import BulkCategorizeRequest
from ...models.bulk_categorize_response import BulkCategorizeResponse
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
  *,
  body: BulkCategorizeRequest,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "post",
    "url": "/v1/transactions/categorize-by-description",
  }

  _kwargs["json"] = body.to_dict()

  headers["Content-Type"] = "application/json"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> BulkCategorizeResponse | HTTPValidationError | None:
  if response.status_code == 200:
    response_200 = BulkCategorizeResponse.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[BulkCategorizeResponse | HTTPValidationError]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient | Client,
  body: BulkCategorizeRequest,
) -> Response[BulkCategorizeResponse | HTTPValidationError]:
  """Bulk Categorize by Description

   Set category for all transactions matching the given description.

  Args:
      body (BulkCategorizeRequest):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[BulkCategorizeResponse | HTTPValidationError]
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
  client: AuthenticatedClient | Client,
  body: BulkCategorizeRequest,
) -> BulkCategorizeResponse | HTTPValidationError | None:
  """Bulk Categorize by Description

   Set category for all transactions matching the given description.

  Args:
      body (BulkCategorizeRequest):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      BulkCategorizeResponse | HTTPValidationError
  """

  return sync_detailed(
    client=client,
    body=body,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient | Client,
  body: BulkCategorizeRequest,
) -> Response[BulkCategorizeResponse | HTTPValidationError]:
  """Bulk Categorize by Description

   Set category for all transactions matching the given description.

  Args:
      body (BulkCategorizeRequest):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[BulkCategorizeResponse | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    body=body,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient | Client,
  body: BulkCategorizeRequest,
) -> BulkCategorizeResponse | HTTPValidationError | None:
  """Bulk Categorize by Description

   Set category for all transactions matching the given description.

  Args:
      body (BulkCategorizeRequest):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      BulkCategorizeResponse | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      client=client,
      body=body,
    )
  ).parsed
