import datetime as dt
from enum import StrEnum
from uuid import UUID

from pydantic import Field, field_validator

from api.common.schemas import Schema

MAX_WEIGHT_KG = 1000


class GymMuscle(StrEnum):
  chest = "chest"
  back = "back"
  shoulders = "shoulders"
  biceps = "biceps"
  triceps = "triceps"
  forearms = "forearms"
  core = "core"
  glutes = "glutes"
  quads = "quads"
  hamstrings = "hamstrings"
  calves = "calves"


class GymExerciseUpsert(Schema):
  name: str = Field(min_length=1, max_length=100, description="What the exercise is called, e.g. 'Bench press'.")
  muscles: list[GymMuscle] | None = Field(
    default=None, max_length=len(GymMuscle), description="Muscle groups it works. Left out, an existing exercise keeps its own."
  )

  @field_validator("name")
  @classmethod
  def tidy_name(cls, name: str) -> str:
    name = " ".join(name.split())
    if not name:
      raise ValueError("Give the exercise a name.")
    return name


class GymExerciseSchema(Schema):
  id: UUID
  name: str
  muscles: list[GymMuscle] = Field(description="Muscle groups it works, in a fixed order (chest first, calves last).")
  created_at: dt.datetime


class GymTopSetUpsert(Schema):
  weight_kg: float = Field(ge=0, le=MAX_WEIGHT_KG, description="The top set's weight in kilograms. 0 for bodyweight.")

  @field_validator("weight_kg")
  @classmethod
  def to_hundredths(cls, weight_kg: float) -> float:
    return round(weight_kg, 2)


class GymTopSetSchema(Schema):
  performed_on: dt.date = Field(description="The local day it was lifted.")
  weight_kg: float


class GymExerciseSummary(GymExerciseSchema):
  last_set: GymTopSetSchema | None = Field(description="The most recent top set.")
  best_set: GymTopSetSchema | None = Field(description="The heaviest top set ever; the most recent if tied.")
  recent_sets: list[GymTopSetSchema] = Field(description="Up to the last 10 top sets, oldest first.")


class GymExerciseListResponse(Schema):
  exercises: list[GymExerciseSummary] = Field(description="Most recently trained first; new exercises count from when they were added.")


class GymTopSetListResponse(Schema):
  sets: list[GymTopSetSchema] = Field(description="Every top set of the exercise, oldest first.")
