from datetime import datetime
from uuid import UUID

from sqlalchemy import TIMESTAMP, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.common.utils import utc_now
from api.models.base import RecordModel


class Device(RecordModel):
  __tablename__ = "devices"
  __table_args__ = (UniqueConstraint("user_id", "device_key"),)

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  device_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
  name: Mapped[str] = mapped_column(String(100), nullable=False)
  last_seen_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, default=utc_now)
