from enum import StrEnum
from uuid import UUID

from sqlalchemy import Boolean, Enum, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class MuscleCategory(StrEnum):
  chest = "chest"
  back = "back"
  shoulders = "shoulders"
  biceps = "biceps"
  triceps = "triceps"
  forearms = "forearms"
  core = "core"
  quads = "quads"
  hamstrings = "hamstrings"
  glutes = "glutes"
  calves = "calves"
  cardio = "cardio"
  olympic = "olympic"
  other = "other"


class Equipment(StrEnum):
  barbell = "barbell"
  dumbbell = "dumbbell"
  cable = "cable"
  machine = "machine"
  bodyweight = "bodyweight"
  kettlebell = "kettlebell"
  band = "band"
  other = "other"


class Exercise(RecordModel):
  __tablename__ = "exercises"

  name: Mapped[str] = mapped_column(String(255), nullable=False)
  category: Mapped[MuscleCategory] = mapped_column(Enum(MuscleCategory), nullable=False)
  equipment: Mapped[Equipment] = mapped_column(Enum(Equipment), nullable=False)
  description: Mapped[str | None] = mapped_column(Text, nullable=True)
  is_custom: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
  user_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
