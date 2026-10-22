from uuid import UUID

from api.common.file_storage import file_storage


def attachment_key(attachment_id: UUID) -> str:
  # The attachment's own id names its file: unique by construction, so uploads never overwrite each other.
  return f"task_attachments/{attachment_id}"


async def save_attachment_file(attachment_id: UUID, content: bytes, content_type: str) -> None:
  await file_storage().put(attachment_key(attachment_id), content, content_type)


async def read_attachment_file(attachment_id: UUID) -> bytes | None:
  return await file_storage().get(attachment_key(attachment_id))


async def delete_attachment_file(attachment_id: UUID) -> None:
  await file_storage().delete(attachment_key(attachment_id))
