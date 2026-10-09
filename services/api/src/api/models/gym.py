from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Date, ForeignKey, Index, Numeric, String, UniqueConstraint, Uuid, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class GymExercise(RecordModel):
  """An exercise someone tracks in the gym, like "Bench press". The id is chosen
  by the app, so an exercise added offline keeps its id when it syncs."""

  __tablename__ = "gym_exercises"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  name: Mapped[str] = mapped_column(String(100), nullable=False)
  # Muscle groups it works, e.g. ["chest", "triceps"]; see GymMuscle.
  muscles: Mapped[list[str]] = mapped_column(ARRAY(String(20)), nullable=False, default=list, server_default="{}")

  __table_args__ = (Index("ix_gym_exercises_user_id_lower_name", "user_id", text("lower(name)"), unique=True),)


class GymTopSet(RecordModel):
  """The heaviest set of an exercise on a day. Only the weight: no reps."""

  __tablename__ = "gym_top_sets"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  exercise_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("gym_exercises.id", ondelete="CASCADE"), nullable=False)
  performed_on: Mapped[date] = mapped_column(Date, nullable=False)
  weight_kg: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)

  __table_args__ = (UniqueConstraint("exercise_id", "performed_on", name="gym_top_sets_exercise_id_performed_on_key"),)
