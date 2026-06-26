from datetime import datetime
from uuid import UUID

from sqlalchemy import TIMESTAMP, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class Notification(RecordModel):
  __tablename__ = "notifications"

  title: Mapped[str] = mapped_column(String(255), nullable=False)
  body: Mapped[str | None] = mapped_column(Text, nullable=True)
  link: Mapped[str | None] = mapped_column(Text, nullable=True)
  kind: Mapped[str] = mapped_column(String(20), nullable=False, default="info")
  read_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True, default=None)
  user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True, index=True)
