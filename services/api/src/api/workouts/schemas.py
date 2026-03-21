from datetime import datetime

from pydantic import UUID4, Field

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema
from api.models.exercise import Equipment, MuscleCategory

# --- Exercises ---


class ExerciseSchema(IDSchema, TimestampedSchema):
  name: str
  category: MuscleCategory
  equipment: Equipment
  description: str | None
  is_custom: bool


class ExerciseCreate(Schema):
  name: str = Field(max_length=255)
  category: MuscleCategory
  equipment: Equipment
  description: str | None = None


class ExerciseListResponse(ListResource[ExerciseSchema]):
  pass


# --- Workout Sets ---


class WorkoutSetSchema(IDSchema, TimestampedSchema):
  workout_log_id: UUID4
  exercise_id: UUID4
  set_number: int
  reps: int
  weight: float
  weight_unit: str
  rpe: int | None
  is_pr: bool
  notes: str | None


class WorkoutSetCreate(Schema):
  exercise_id: UUID4
  set_number: int = Field(ge=1)
  reps: int = Field(ge=0)
  weight: float = Field(ge=0)
  weight_unit: str = Field(default="kg", max_length=3)
  rpe: int | None = Field(default=None, ge=1, le=10)
  notes: str | None = None


class WorkoutSetUpdate(Schema):
  reps: int | None = Field(default=None, ge=0)
  weight: float | None = Field(default=None, ge=0)
  weight_unit: str | None = Field(default=None, max_length=3)
  rpe: int | None = Field(default=None, ge=1, le=10)
  notes: str | None = None


# --- Workout Logs ---


class WorkoutLogSchema(IDSchema, TimestampedSchema):
  started_at: datetime
  completed_at: datetime | None
  notes: str | None


class WorkoutLogDetailSchema(WorkoutLogSchema):
  sets: list[WorkoutSetSchema]


class WorkoutLogCreate(Schema):
  started_at: datetime
  notes: str | None = None


class WorkoutLogUpdate(Schema):
  completed_at: datetime | None = None
  notes: str | None = None


class WorkoutLogListResponse(ListResource[WorkoutLogSchema]):
  pass


# --- Workout Set with Exercise info (for history) ---


class WorkoutSetWithExerciseSchema(WorkoutSetSchema):
  exercise_name: str
  exercise_category: MuscleCategory


# --- PRs ---


class ExercisePRSchema(Schema):
  exercise_id: UUID4
  exercise_name: str
  reps: int
  weight: float
  weight_unit: str
  achieved_at: datetime


class ExercisePRListResponse(Schema):
  items: list[ExercisePRSchema]
