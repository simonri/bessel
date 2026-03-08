from datetime import date, datetime

from sqlalchemy import Boolean, Date, Float, Integer, String, Text, TIMESTAMP, Uuid, ForeignKey
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class Task(RecordModel):
  __tablename__ = "tasks"

  title: Mapped[str] = mapped_column(String(500), nullable=False)
  description: Mapped[str | None] = mapped_column(Text, nullable=True)
  status: Mapped[str] = mapped_column(String(20), nullable=False, default="todo", index=True)
  priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

  due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
  completed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

  project: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
  area: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
  tags: Mapped[list[str] | None] = mapped_column(ARRAY(String(50)), nullable=True)
  position: Mapped[float] = mapped_column(Float, nullable=False, default=0)

  # Recurrence
  is_recurring: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
  rrule_frequency: Mapped[str | None] = mapped_column(String(20), nullable=True)
  rrule_interval: Mapped[int | None] = mapped_column(Integer, nullable=True, default=1)
  rrule_day_of_week: Mapped[int | None] = mapped_column(Integer, nullable=True)
  rrule_day_of_month: Mapped[int | None] = mapped_column(Integer, nullable=True)

  # Chain linking for recurring instances
  parent_task_id: Mapped[str | None] = mapped_column(Uuid, ForeignKey("tasks.id"), nullable=True)
