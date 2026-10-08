from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, UploadFile

from api.common.pagination import PaginationParamsQuery
from api.common.sorting import Sorting, SortingGetter, apply_sorting
from api.common.uploads import detect_image_type, read_upload
from api.exceptions import ResourceNotFound, ValidationError
from api.models.task import Task
from api.models.task_attachment import TaskAttachment
from api.postgres import AsyncSession, DBSession
from api.tasks.attachment_storage import delete_attachment_file, read_attachment_file, save_attachment_file
from api.tasks.repository import TaskAttachmentRepository, TaskRepository
from api.tasks.schemas import TaskAttachmentSchema, TaskCompleteResponse, TaskCreate, TaskListResponse, TaskReorderItem, TaskSchema, TaskStatus, TaskUpdate
from api.tasks.service import task_service
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/tasks", tags=["tasks"])

MAX_ATTACHMENT_SIZE_BYTES = 15 * 1024 * 1024
MAX_ATTACHMENT_STORAGE_PER_USER_BYTES = 1024 * 1024 * 1024


async def _get_owned_attachment(session: AsyncSession, task_id: UUID, attachment_id: UUID, user_id: UUID) -> TaskAttachment:
  # Ownership is checked transitively through the task rather than a
  # user_id column on the attachment itself — a task the user doesn't own
  # 404s here before the attachment lookup even runs.
  await TaskRepository.from_session(session).get_owned_or_404(task_id, user_id, not_found_message="Task not found")
  attachment = await TaskAttachmentRepository.from_session(session).get_by_id(attachment_id)
  if attachment is None or attachment.task_id != task_id:
    raise ResourceNotFound("Attachment not found")
  return attachment


class TaskSortProperty(StrEnum):
  created_at = "created_at"
  due_date = "due_date"
  priority = "priority"
  title = "title"
  completed_at = "completed_at"
  position = "position"


sorting_getter = SortingGetter(TaskSortProperty, default_sorting=["-created_at"])


@router.get(
  "",
  summary="List Tasks",
  response_model=TaskListResponse,
)
async def list_tasks(
  session: DBSession,
  current_user: CurrentDBUser,
  pagination: PaginationParamsQuery,
  sorting: Annotated[list[Sorting[TaskSortProperty]], Depends(sorting_getter)],
  status: Annotated[list[TaskStatus] | None, Query(description="Filter by status. Repeat to filter by multiple.")] = None,
  priority: int | None = Query(default=None, ge=0, le=4, description="Filter by priority."),
  project: str | None = Query(default=None, description="Filter by project."),
  is_recurring: bool | None = Query(default=None, description="Filter by recurring."),
  completed_after: int | None = Query(default=None, description="Filter tasks completed after this Unix timestamp (inclusive)."),
  completed_before: int | None = Query(default=None, description="Filter tasks completed before this Unix timestamp (exclusive)."),
) -> TaskListResponse:
  repo = TaskRepository.from_session(session)
  statement = repo.get_filtered_statement(
    current_user.id,
    statuses=status,
    priority=priority,
    project=project,
    is_recurring=is_recurring,
    completed_after=datetime.fromtimestamp(completed_after, tz=UTC) if completed_after is not None else None,
    completed_before=datetime.fromtimestamp(completed_before, tz=UTC) if completed_before is not None else None,
  )

  statement = apply_sorting(statement, Task, sorting)

  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  return TaskListResponse.from_paginated_results(
    [TaskSchema.model_validate(item) for item in items],
    total_count,
    pagination,
  )


@router.post(
  "",
  summary="Create Task",
  response_model=TaskSchema,
  status_code=201,
)
async def create_task(
  body: TaskCreate,
  session: DBSession,
  current_user: CurrentDBUser,
) -> TaskSchema:
  task = await task_service.create(session, current_user.id, body)
  return TaskSchema.model_validate(task)


# Registered before /{task_id} — FastAPI matches routes in definition order,
# and "/reorder" would otherwise be captured (and 422) as a task_id.
@router.patch(
  "/reorder",
  summary="Reorder Tasks",
  status_code=204,
)
async def reorder_tasks(
  body: list[TaskReorderItem],
  session: DBSession,
  current_user: CurrentDBUser,
) -> None:
  repo = TaskRepository.from_session(session)
  tasks_by_id = {task.id: task for task in await repo.list_by_ids_for_user([item.id for item in body], current_user.id)}
  for item in body:
    task = tasks_by_id.get(item.id)
    if task is None:
      continue
    update: dict = {"position": item.position}
    if item.status is not None:
      update["status"] = item.status
    await repo.update(task, update_dict=update)


@router.patch(
  "/{task_id}",
  summary="Update Task",
  response_model=TaskSchema,
)
async def update_task(
  task_id: UUID,
  body: TaskUpdate,
  session: DBSession,
  current_user: CurrentDBUser,
) -> TaskSchema:
  task = await TaskRepository.from_session(session).get_owned_or_404(task_id, current_user.id, not_found_message="Task not found")
  await task_service.update(session, task, body.model_dump(exclude_unset=True))
  return TaskSchema.model_validate(task)


@router.delete(
  "/{task_id}",
  summary="Delete Task",
  status_code=204,
)
async def delete_task(
  task_id: UUID,
  session: DBSession,
  current_user: CurrentDBUser,
) -> None:
  repo = TaskRepository.from_session(session)
  task = await repo.get_owned_or_404(task_id, current_user.id, not_found_message="Task not found")
  # Grabbed before delete — the ORM cascade removes the attachment rows, but
  # the files on disk are only ours to clean up once the DB delete succeeds.
  attachment_ids = [attachment.id for attachment in task.attachments]
  await repo.delete(task)
  for attachment_id in attachment_ids:
    await delete_attachment_file(attachment_id)


@router.post(
  "/{task_id}/attachments",
  summary="Upload Task Attachment",
  response_model=TaskAttachmentSchema,
  status_code=201,
)
async def upload_task_attachment(
  task_id: UUID,
  file: UploadFile,
  session: DBSession,
  current_user: CurrentDBUser,
) -> TaskAttachmentSchema:
  await TaskRepository.from_session(session).get_owned_or_404(task_id, current_user.id, not_found_message="Task not found")

  content = await read_upload(file, MAX_ATTACHMENT_SIZE_BYTES, "Image is too large (max 15 MB).")
  content_type = detect_image_type(content)
  if content_type is None:
    raise ValidationError("Only PNG, JPEG, GIF, WebP, HEIC and AVIF images are supported.")

  attachment_repo = TaskAttachmentRepository.from_session(session)
  if await attachment_repo.total_bytes_for_user(current_user.id) + len(content) > MAX_ATTACHMENT_STORAGE_PER_USER_BYTES:
    raise ValidationError("Attachment storage limit reached (1 GB).", status_code=413)
  attachment = await attachment_repo.create(
    TaskAttachment(
      task_id=task_id,
      filename=(file.filename or "image")[:255],
      content_type=content_type,
      size_bytes=len(content),
    ),
    flush=True,
  )
  # Written only after the row is flushed, so the attachment's (now assigned)
  # id is what names the file on disk.
  await save_attachment_file(attachment.id, content)
  return TaskAttachmentSchema.model_validate(attachment)


@router.delete(
  "/{task_id}/attachments/{attachment_id}",
  summary="Delete Task Attachment",
  status_code=204,
)
async def delete_task_attachment(
  task_id: UUID,
  attachment_id: UUID,
  session: DBSession,
  current_user: CurrentDBUser,
) -> None:
  attachment = await _get_owned_attachment(session, task_id, attachment_id, current_user.id)
  await TaskAttachmentRepository.from_session(session).delete(attachment, flush=True)
  await delete_attachment_file(attachment_id)


@router.get(
  "/{task_id}/attachments/{attachment_id}/file",
  summary="Get Task Attachment File",
)
async def get_task_attachment_file(
  task_id: UUID,
  attachment_id: UUID,
  session: DBSession,
  current_user: CurrentDBUser,
) -> Response:
  attachment = await _get_owned_attachment(session, task_id, attachment_id, current_user.id)
  content = await read_attachment_file(attachment_id)
  return Response(
    content=content,
    media_type=attachment.content_type,
    headers={
      "Content-Disposition": "attachment",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  )


@router.post(
  "/{task_id}/complete",
  summary="Complete Task",
  response_model=TaskCompleteResponse,
)
async def complete_task(
  task_id: UUID,
  session: DBSession,
  current_user: CurrentDBUser,
) -> TaskCompleteResponse:
  task = await TaskRepository.from_session(session).get_owned_or_404(task_id, current_user.id, not_found_message="Task not found")
  next_task = await task_service.complete(session, task)
  return TaskCompleteResponse(
    completed_task=TaskSchema.model_validate(task),
    next_task=TaskSchema.model_validate(next_task) if next_task else None,
  )


@router.post(
  "/{task_id}/reopen",
  summary="Reopen Task",
  response_model=TaskSchema,
)
async def reopen_task(
  task_id: UUID,
  session: DBSession,
  current_user: CurrentDBUser,
) -> TaskSchema:
  repo = TaskRepository.from_session(session)
  task = await repo.get_owned_or_404(task_id, current_user.id, not_found_message="Task not found")
  await repo.update(task, update_dict={"status": "todo", "completed_at": None})
  return TaskSchema.model_validate(task)


@router.post(
  "/{task_id}/undo-complete",
  summary="Undo Complete Task",
  response_model=TaskSchema,
)
async def undo_complete_task(
  task_id: UUID,
  session: DBSession,
  current_user: CurrentDBUser,
) -> TaskSchema:
  """Reopen a task and remove the next occurrence completing it spawned, in one
  transaction, so an Undo can't leave a routine both reopened and repeated."""
  task = await TaskRepository.from_session(session).get_owned_or_404(task_id, current_user.id, not_found_message="Task not found")
  await task_service.undo_complete(session, task)
  return TaskSchema.model_validate(task)


# Areas were removed. iOS builds from before still load them alongside tasks,
# and without this "/areas" would reach get_task and fail the whole load.
@router.get("/areas", include_in_schema=False)
async def list_areas() -> list[str]:
  return []


@router.get(
  "/{task_id}",
  summary="Get Task",
  response_model=TaskSchema,
)
async def get_task(
  task_id: UUID,
  session: DBSession,
  current_user: CurrentDBUser,
) -> TaskSchema:
  task = await TaskRepository.from_session(session).get_owned_or_404(task_id, current_user.id, not_found_message="Task not found")
  return TaskSchema.model_validate(task)
