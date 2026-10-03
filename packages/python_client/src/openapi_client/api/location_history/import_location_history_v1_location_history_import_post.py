from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.body_import_location_history_v1_location_history_import_post import BodyImportLocationHistoryV1LocationHistoryImportPost
from ...models.http_validation_error import HTTPValidationError
from ...models.location_import_schema import LocationImportSchema
from ...types import Response


def _get_kwargs(
  *,
  body: BodyImportLocationHistoryV1LocationHistoryImportPost,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "post",
    "url": "/v1/location-history/import",
  }

  _kwargs["files"] = body.to_multipart()

  headers["Content-Type"] = "multipart/form-data; boundary=+++"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | LocationImportSchema | None:
  if response.status_code == 200:
    response_200 = LocationImportSchema.from_dict(response.json())

    return response_200

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | LocationImportSchema]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  *,
  client: AuthenticatedClient,
  body: BodyImportLocationHistoryV1LocationHistoryImportPost,
) -> Response[HTTPValidationError | LocationImportSchema]:
  """Import Google Timeline

   Import a Timeline.json from Google Maps' "Export Timeline data".

  Safe to repeat: segments already stored are left as they are, edited ones
  are updated, and ones the phone no longer has within the export's span are
  removed. An export older than what's stored never overrides it.

  Args:
      body (BodyImportLocationHistoryV1LocationHistoryImportPost):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | LocationImportSchema]
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
  body: BodyImportLocationHistoryV1LocationHistoryImportPost,
) -> HTTPValidationError | LocationImportSchema | None:
  """Import Google Timeline

   Import a Timeline.json from Google Maps' "Export Timeline data".

  Safe to repeat: segments already stored are left as they are, edited ones
  are updated, and ones the phone no longer has within the export's span are
  removed. An export older than what's stored never overrides it.

  Args:
      body (BodyImportLocationHistoryV1LocationHistoryImportPost):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | LocationImportSchema
  """

  return sync_detailed(
    client=client,
    body=body,
  ).parsed


async def asyncio_detailed(
  *,
  client: AuthenticatedClient,
  body: BodyImportLocationHistoryV1LocationHistoryImportPost,
) -> Response[HTTPValidationError | LocationImportSchema]:
  """Import Google Timeline

   Import a Timeline.json from Google Maps' "Export Timeline data".

  Safe to repeat: segments already stored are left as they are, edited ones
  are updated, and ones the phone no longer has within the export's span are
  removed. An export older than what's stored never overrides it.

  Args:
      body (BodyImportLocationHistoryV1LocationHistoryImportPost):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | LocationImportSchema]
  """

  kwargs = _get_kwargs(
    body=body,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  *,
  client: AuthenticatedClient,
  body: BodyImportLocationHistoryV1LocationHistoryImportPost,
) -> HTTPValidationError | LocationImportSchema | None:
  """Import Google Timeline

   Import a Timeline.json from Google Maps' "Export Timeline data".

  Safe to repeat: segments already stored are left as they are, edited ones
  are updated, and ones the phone no longer has within the export's span are
  removed. An export older than what's stored never overrides it.

  Args:
      body (BodyImportLocationHistoryV1LocationHistoryImportPost):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | LocationImportSchema
  """

  return (
    await asyncio_detailed(
      client=client,
      body=body,
    )
  ).parsed
