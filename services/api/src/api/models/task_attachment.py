from uuid import UUID

from sqlalchemy import ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class TaskAttachment(RecordModel):
  __tablename__ = "task_attachments"

  task_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
  filename: Mapped[str] = mapped_column(String(255), nullable=False)
  content_type: Mapped[str] = mapped_column(String(100), nullable=False)
  size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
