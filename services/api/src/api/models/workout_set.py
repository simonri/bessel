from uuid import UUID

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from api.models.base import RecordModel
from api.models.exercise import Exercise
from api.models.workout_log import WorkoutLog


class WorkoutSet(RecordModel):
  __tablename__ = "workout_sets"

  workout_log_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("workout_logs.id", ondelete="CASCADE"), nullable=False)
  exercise_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False)
  set_number: Mapped[int] = mapped_column(Integer, nullable=False)
  reps: Mapped[int] = mapped_column(Integer, nullable=False)
  weight: Mapped[float] = mapped_column(Float, nullable=False)
  weight_unit: Mapped[str] = mapped_column(String(3), nullable=False, default="kg")
  rpe: Mapped[int | None] = mapped_column(Integer, nullable=True)
  is_pr: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
  notes: Mapped[str | None] = mapped_column(Text, nullable=True)

  @declared_attr
  def workout_log(cls) -> Mapped["WorkoutLog"]:
    return relationship("WorkoutLog", lazy="raise")

  @declared_attr
  def exercise(cls) -> Mapped["Exercise"]:
    return relationship("Exercise", lazy="raise")
