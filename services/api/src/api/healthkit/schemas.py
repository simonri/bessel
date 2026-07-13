from datetime import datetime
from typing import Any

from pydantic import UUID4, Field

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema

MAX_SYNC_BATCH_SIZE = 500


class HealthKitWorkoutUpload(Schema):
  """One HKWorkout sample, mirrored field-by-field from HealthKit."""

  healthkit_uuid: UUID4 = Field(description="HKObject.uuid, stable across devices.")
  workout_activity_type: int = Field(ge=0, description="HKWorkoutActivityType raw value.")
  workout_activity_type_name: str = Field(max_length=64, description="Human-readable activity type, e.g. 'running'.")
  start_date: datetime
  end_date: datetime
  duration: float = Field(ge=0, description="Duration in seconds.")
  total_energy_burned: float | None = Field(default=None, ge=0, description="Active energy in kcal.")
  total_distance: float | None = Field(default=None, ge=0, description="Distance in meters.")
  source_name: str = Field(max_length=255)
  source_bundle_id: str = Field(max_length=255)
  source_version: str | None = Field(default=None, max_length=50)
  device_name: str | None = Field(default=None, max_length=255)
  workout_metadata: dict[str, Any] | None = Field(default=None, description="HKWorkout.metadata, JSON-safe subset.")
  statistics: dict[str, Any] | None = Field(default=None, description="Per-quantity statistics keyed by HK identifier.")


class HealthKitWorkoutSyncRequest(Schema):
  workouts: list[HealthKitWorkoutUpload] = Field(default_factory=list, max_length=MAX_SYNC_BATCH_SIZE)
  deleted_uuids: list[UUID4] = Field(
    default_factory=list,
    max_length=MAX_SYNC_BATCH_SIZE,
    description="HealthKit UUIDs of workouts deleted on-device since the last sync anchor.",
  )


class HealthKitWorkoutSyncResponse(Schema):
  synced: int = Field(description="Number of workouts inserted or updated.")
  deleted: int = Field(description="Number of workouts soft-deleted.")


class HealthKitWorkoutSchema(IDSchema, TimestampedSchema):
  healthkit_uuid: UUID4
  workout_activity_type: int
  workout_activity_type_name: str
  start_date: datetime
  end_date: datetime
  duration: float
  total_energy_burned: float | None
  total_distance: float | None
  source_name: str
  source_bundle_id: str
  source_version: str | None
  device_name: str | None
  workout_metadata: dict[str, Any] | None
  statistics: dict[str, Any] | None


class HealthKitWorkoutListResponse(ListResource[HealthKitWorkoutSchema]):
  pass
