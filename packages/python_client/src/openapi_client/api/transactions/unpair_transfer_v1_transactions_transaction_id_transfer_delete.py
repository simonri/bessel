from http import HTTPStatus
from typing import Any, cast
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
  transaction_id: UUID,
) -> dict[str, Any]:

  _kwargs: dict[str, Any] = {
    "method": "delete",
    "url": "/v1/transactions/{transaction_id}/transfer".format(
      transaction_id=quote(str(transaction_id), safe=""),
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
  transaction_id: UUID,
  *,
  client: AuthenticatedClient,
) -> Response[Any | HTTPValidationError]:
  """Unpair Transfer

   Counts both sides of a paired transfer as income and spending again, and never pairs them again.

  Args:
      transaction_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[Any | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    transaction_id=transaction_id,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  transaction_id: UUID,
  *,
  client: AuthenticatedClient,
) -> Any | HTTPValidationError | None:
  """Unpair Transfer

   Counts both sides of a paired transfer as income and spending again, and never pairs them again.

  Args:
      transaction_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Any | HTTPValidationError
  """

  return sync_detailed(
    transaction_id=transaction_id,
    client=client,
  ).parsed


async def asyncio_detailed(
  transaction_id: UUID,
  *,
  client: AuthenticatedClient,
) -> Response[Any | HTTPValidationError]:
  """Unpair Transfer

   Counts both sides of a paired transfer as income and spending again, and never pairs them again.

  Args:
      transaction_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[Any | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    transaction_id=transaction_id,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  transaction_id: UUID,
  *,
  client: AuthenticatedClient,
) -> Any | HTTPValidationError | None:
  """Unpair Transfer

   Counts both sides of a paired transfer as income and spending again, and never pairs them again.

  Args:
      transaction_id (UUID):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Any | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      transaction_id=transaction_id,
      client=client,
    )
  ).parsed
