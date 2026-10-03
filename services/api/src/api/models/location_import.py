from datetime import datetime
from uuid import UUID

from sqlalchemy import TIMESTAMP, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class LocationImport(RecordModel):
  """One uploaded Google Timeline export and what it changed."""

  __tablename__ = "location_imports"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
  filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
  format: Mapped[str] = mapped_column(String(16), nullable=False)
  # The export's latest recorded moment: how new its knowledge is.
  as_of: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
  range_start: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
  range_end: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
  segments: Mapped[int] = mapped_column(Integer, nullable=False)
  added: Mapped[int] = mapped_column(Integer, nullable=False)
  updated: Mapped[int] = mapped_column(Integer, nullable=False)
  removed: Mapped[int] = mapped_column(Integer, nullable=False)
  unchanged: Mapped[int] = mapped_column(Integer, nullable=False)
  stale: Mapped[int] = mapped_column(Integer, nullable=False)
