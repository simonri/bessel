from http import HTTPStatus
from typing import Any
from urllib.parse import quote

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.crypto_price_schema import CryptoPriceSchema
from ...models.http_validation_error import HTTPValidationError
from ...types import UNSET, Response, Unset


def _get_kwargs(
  coin_id: str,
  *,
  currency: str | Unset = 'usd',
) -> dict[str, Any]:

  params: dict[str, Any] = {}

  params["currency"] = currency

  params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

  _kwargs: dict[str, Any] = {
    "method": "get",
    "url": "/v1/investments/crypto/price/{coin_id}".format(
      coin_id=quote(str(coin_id), safe=""),
    ),
    "params": params,
  }

  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> CryptoPriceSchema | HTTPValidationError | None:
  if response.status_code == 200:
    response_200 = CryptoPriceSchema.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[CryptoPriceSchema | HTTPValidationError]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  coin_id: str,
  *,
  client: AuthenticatedClient,
  currency: str | Unset = 'usd',
) -> Response[CryptoPriceSchema | HTTPValidationError]:
  """Get Crypto Price

  Args:
      coin_id (str):
      currency (str | Unset):  Default: 'usd'.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[CryptoPriceSchema | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    coin_id=coin_id,
    currency=currency,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  coin_id: str,
  *,
  client: AuthenticatedClient,
  currency: str | Unset = 'usd',
) -> CryptoPriceSchema | HTTPValidationError | None:
  """Get Crypto Price

  Args:
      coin_id (str):
      currency (str | Unset):  Default: 'usd'.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      CryptoPriceSchema | HTTPValidationError
  """

  return sync_detailed(
    coin_id=coin_id,
    client=client,
    currency=currency,
  ).parsed


async def asyncio_detailed(
  coin_id: str,
  *,
  client: AuthenticatedClient,
  currency: str | Unset = 'usd',
) -> Response[CryptoPriceSchema | HTTPValidationError]:
  """Get Crypto Price

  Args:
      coin_id (str):
      currency (str | Unset):  Default: 'usd'.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[CryptoPriceSchema | HTTPValidationError]
  """

  kwargs = _get_kwargs(
    coin_id=coin_id,
    currency=currency,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  coin_id: str,
  *,
  client: AuthenticatedClient,
  currency: str | Unset = 'usd',
) -> CryptoPriceSchema | HTTPValidationError | None:
  """Get Crypto Price

  Args:
      coin_id (str):
      currency (str | Unset):  Default: 'usd'.

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      CryptoPriceSchema | HTTPValidationError
  """

  return (
    await asyncio_detailed(
      coin_id=coin_id,
      client=client,
      currency=currency,
    )
  ).parsed
