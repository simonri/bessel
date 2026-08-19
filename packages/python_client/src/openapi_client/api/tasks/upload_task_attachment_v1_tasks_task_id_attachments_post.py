from http import HTTPStatus
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.body_upload_task_attachment_v1_tasks_task_id_attachments_post import BodyUploadTaskAttachmentV1TasksTaskIdAttachmentsPost
from ...models.http_validation_error import HTTPValidationError
from ...models.task_attachment_schema import TaskAttachmentSchema
from ...types import Response


def _get_kwargs(
  task_id: UUID,
  *,
  body: BodyUploadTaskAttachmentV1TasksTaskIdAttachmentsPost,
) -> dict[str, Any]:
  headers: dict[str, Any] = {}

  _kwargs: dict[str, Any] = {
    "method": "post",
    "url": "/v1/tasks/{task_id}/attachments".format(
      task_id=quote(str(task_id), safe=""),
    ),
  }

  _kwargs["files"] = body.to_multipart()

  headers["Content-Type"] = "multipart/form-data; boundary=+++"

  _kwargs["headers"] = headers
  return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> HTTPValidationError | TaskAttachmentSchema | None:
  if response.status_code == 201:
    response_201 = TaskAttachmentSchema.from_dict(response.json())

    return response_201

  if response.status_code == 422:
    response_422 = HTTPValidationError.from_dict(response.json())

    return response_422

  if client.raise_on_unexpected_status:
    raise errors.UnexpectedStatus(response.status_code, response.content)
  else:
    return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[HTTPValidationError | TaskAttachmentSchema]:
  return Response(
    status_code=HTTPStatus(response.status_code),
    content=response.content,
    headers=response.headers,
    parsed=_parse_response(client=client, response=response),
  )


def sync_detailed(
  task_id: UUID,
  *,
  client: AuthenticatedClient,
  body: BodyUploadTaskAttachmentV1TasksTaskIdAttachmentsPost,
) -> Response[HTTPValidationError | TaskAttachmentSchema]:
  """Upload Task Attachment

  Args:
      task_id (UUID):
      body (BodyUploadTaskAttachmentV1TasksTaskIdAttachmentsPost):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TaskAttachmentSchema]
  """

  kwargs = _get_kwargs(
    task_id=task_id,
    body=body,
  )

  response = client.get_httpx_client().request(
    **kwargs,
  )

  return _build_response(client=client, response=response)


def sync(
  task_id: UUID,
  *,
  client: AuthenticatedClient,
  body: BodyUploadTaskAttachmentV1TasksTaskIdAttachmentsPost,
) -> HTTPValidationError | TaskAttachmentSchema | None:
  """Upload Task Attachment

  Args:
      task_id (UUID):
      body (BodyUploadTaskAttachmentV1TasksTaskIdAttachmentsPost):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TaskAttachmentSchema
  """

  return sync_detailed(
    task_id=task_id,
    client=client,
    body=body,
  ).parsed


async def asyncio_detailed(
  task_id: UUID,
  *,
  client: AuthenticatedClient,
  body: BodyUploadTaskAttachmentV1TasksTaskIdAttachmentsPost,
) -> Response[HTTPValidationError | TaskAttachmentSchema]:
  """Upload Task Attachment

  Args:
      task_id (UUID):
      body (BodyUploadTaskAttachmentV1TasksTaskIdAttachmentsPost):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      Response[HTTPValidationError | TaskAttachmentSchema]
  """

  kwargs = _get_kwargs(
    task_id=task_id,
    body=body,
  )

  response = await client.get_async_httpx_client().request(**kwargs)

  return _build_response(client=client, response=response)


async def asyncio(
  task_id: UUID,
  *,
  client: AuthenticatedClient,
  body: BodyUploadTaskAttachmentV1TasksTaskIdAttachmentsPost,
) -> HTTPValidationError | TaskAttachmentSchema | None:
  """Upload Task Attachment

  Args:
      task_id (UUID):
      body (BodyUploadTaskAttachmentV1TasksTaskIdAttachmentsPost):

  Raises:
      errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
      httpx.TimeoutException: If the request takes longer than Client.timeout.

  Returns:
      HTTPValidationError | TaskAttachmentSchema
  """

  return (
    await asyncio_detailed(
      task_id=task_id,
      client=client,
      body=body,
    )
  ).parsed
