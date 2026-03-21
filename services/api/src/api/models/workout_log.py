from datetime import datetime

from sqlalchemy import TIMESTAMP, Text
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class WorkoutLog(RecordModel):
  __tablename__ = "workout_logs"

  started_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
  completed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
  notes: Mapped[str | None] = mapped_column(Text, nullable=True)
