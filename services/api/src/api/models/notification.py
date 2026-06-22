from datetime import datetime

from sqlalchemy import TIMESTAMP, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class Notification(RecordModel):
  __tablename__ = "notifications"

  title: Mapped[str] = mapped_column(String(255), nullable=False)
  body: Mapped[str | None] = mapped_column(Text, nullable=True)
  kind: Mapped[str] = mapped_column(String(20), nullable=False, default="info")
  read_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True, default=None)
