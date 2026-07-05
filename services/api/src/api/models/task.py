from datetime import date, datetime
from uuid import UUID

from sqlalchemy import TIMESTAMP, Boolean, Date, Float, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.models.base import RecordModel
from api.models.project import Project


class Task(RecordModel):
  __tablename__ = "tasks"

  title: Mapped[str] = mapped_column(String(500), nullable=False)
  description: Mapped[str | None] = mapped_column(Text, nullable=True)
  status: Mapped[str] = mapped_column(String(20), nullable=False, default="todo", index=True)
  priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

  due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
  completed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

  project_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("projects.id"), nullable=True, index=True)
  project_obj: Mapped[Project | None] = relationship("Project", lazy="selectin")
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

  user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True, index=True)

  @property
  def project(self) -> str | None:
    return self.project_obj.name if self.project_obj else None
