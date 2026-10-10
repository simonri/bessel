from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import TIMESTAMP, CheckConstraint, ForeignKey, Index, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .base import RecordModel


class TimeProject(RecordModel):
  """A client project hours are logged against; separate from code projects."""

  __tablename__ = "time_projects"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  name: Mapped[str] = mapped_column(String(200), nullable=False)
  client: Mapped[str | None] = mapped_column(String(200), nullable=True)
  color: Mapped[str] = mapped_column(String(16), nullable=False)
  hourly_rate: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
  currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
  archived_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)


class TimeEntry(RecordModel):
  __tablename__ = "time_entries"
  __table_args__ = (
    CheckConstraint("end_ts > start_ts", name="positive_duration"),
    Index("ix_time_entries_user_id_start_ts", "user_id", "start_ts"),
  )

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False)
  time_project_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("time_projects.id"), nullable=False, index=True)
  start_ts: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
  end_ts: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
  note: Mapped[str | None] = mapped_column(Text, nullable=True)
