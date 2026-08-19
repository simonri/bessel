from pathlib import Path
from uuid import UUID

import anyio

from api.settings import settings


def _attachments_dir() -> Path:
  path = Path(settings.TASK_ATTACHMENTS_DIR)
  path.mkdir(parents=True, exist_ok=True)
  return path


def attachment_file_path(attachment_id: UUID) -> Path:
  # The attachment's own id doubles as its on-disk filename — always unique
  # by construction, so two uploads can never collide or overwrite each other.
  return _attachments_dir() / str(attachment_id)


async def save_attachment_file(attachment_id: UUID, content: bytes) -> None:
  await anyio.to_thread.run_sync(attachment_file_path(attachment_id).write_bytes, content)


async def read_attachment_file(attachment_id: UUID) -> bytes:
  return await anyio.to_thread.run_sync(attachment_file_path(attachment_id).read_bytes)


async def delete_attachment_file(attachment_id: UUID) -> None:
  await anyio.to_thread.run_sync(lambda: attachment_file_path(attachment_id).unlink(missing_ok=True))
