import datetime as dt
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


class HealthKitSleepSampleUpload(Schema):
  """One HKCategorySample for sleep analysis, mirrored field-by-field from HealthKit."""

  healthkit_uuid: UUID4 = Field(description="HKObject.uuid, stable across devices.")
  sleep_value: int = Field(ge=0, description="HKCategoryValueSleepAnalysis raw value.")
  sleep_value_name: str = Field(max_length=32, description="e.g. 'asleepCore', 'awake', 'inBed'.")
  start_date: datetime
  end_date: datetime
  source_name: str = Field(max_length=255)
  source_bundle_id: str = Field(max_length=255)
  source_version: str | None = Field(default=None, max_length=50)
  device_name: str | None = Field(default=None, max_length=255)
  sample_metadata: dict[str, Any] | None = Field(default=None, description="HKCategorySample.metadata, JSON-safe subset.")


class HealthKitSleepSyncRequest(Schema):
  samples: list[HealthKitSleepSampleUpload] = Field(default_factory=list, max_length=MAX_SYNC_BATCH_SIZE)
  deleted_uuids: list[UUID4] = Field(
    default_factory=list,
    max_length=MAX_SYNC_BATCH_SIZE,
    description="HealthKit UUIDs of sleep samples deleted on-device since the last sync anchor.",
  )


class HealthKitSleepSyncResponse(Schema):
  synced: int = Field(description="Number of sleep samples inserted or updated.")
  deleted: int = Field(description="Number of sleep samples soft-deleted.")


class HealthKitSleepSampleSchema(IDSchema, TimestampedSchema):
  healthkit_uuid: UUID4
  sleep_value: int
  sleep_value_name: str
  start_date: datetime
  end_date: datetime
  source_name: str
  source_bundle_id: str
  source_version: str | None
  device_name: str | None
  sample_metadata: dict[str, Any] | None


class HealthKitSleepListResponse(ListResource[HealthKitSleepSampleSchema]):
  pass


class SleepDailyEntry(Schema):
  date: str = Field(description="Wake date (ISO 8601), not the bed date — a night is bucketed to the date the sleeper woke up.")
  asleep_secs: int
  sleep_onset: str | None = Field(
    default=None,
    description="Local time (ISO 8601 with UTC offset) the night's longest unbroken sleep episode began. Null if no asleep segments were recorded.",
  )
  wake_time: str | None = Field(
    default=None,
    description="Local time (ISO 8601 with UTC offset) the night's longest unbroken sleep episode ended. Null if no asleep segments were recorded.",
  )


class SleepDailyResponse(Schema):
  nights: list[SleepDailyEntry]


class SleepStageSummary(Schema):
  stage: str = Field(description="HKCategoryValueSleepAnalysis name, e.g. 'asleepCore', 'awake'.")
  secs: int
  percentage: float = Field(description="Share of the total queried window (all stages), not just asleep time.")


class SleepSummaryResponse(Schema):
  total_asleep_secs: int
  stages: list[SleepStageSummary]


class HealthKitDailyMetricUpload(Schema):
  """One local day of totals and averages, computed on the device by HealthKit's
  statistics queries so overlapping iPhone and Watch samples count once."""

  date: dt.date = Field(description="Local calendar date the values belong to.")
  steps: int | None = Field(default=None, ge=0)
  active_energy_kcal: float | None = Field(default=None, ge=0)
  exercise_minutes: float | None = Field(default=None, ge=0, le=1440)
  resting_heart_rate: float | None = Field(default=None, gt=0, le=250, description="Beats per minute.")
  hrv_ms: float | None = Field(default=None, gt=0, le=500, description="Heart rate variability (SDNN), milliseconds.")


class HealthKitDailyMetricsSyncRequest(Schema):
  days: list[HealthKitDailyMetricUpload] = Field(max_length=MAX_SYNC_BATCH_SIZE, description="Each day's values replace what was stored for it.")


class HealthKitDailyMetricsSyncResponse(Schema):
  synced: int = Field(description="Number of days inserted or updated.")


class SleepDaySummary(Schema):
  score: int = Field(ge=0, le=100)
  label: str
  asleep_secs: int
  usual_asleep_secs: int | None = Field(description="Average over up to 14 earlier nights; null with fewer than 3.")
  sleep_onset: str | None = Field(description="Local time (ISO 8601 with offset) the main sleep began.")
  wake_time: str | None = Field(description="Local time (ISO 8601 with offset) the main sleep ended.")
  deep_secs: int
  core_secs: int
  rem_secs: int
  awake_secs: int


class MoveDaySummary(Schema):
  score: int | None = Field(ge=0, le=100, description="Null until there's a usual to compare against.")
  label: str
  is_partial_day: bool = Field(description="True for today: compared against the usual for this time of day.")
  steps: int | None
  usual_steps: int | None
  active_energy_kcal: float | None
  usual_active_energy_kcal: float | None
  exercise_minutes: float | None
  workout_count: int
  workout_minutes: float


class EnergyDaySummary(Schema):
  score: int | None = Field(ge=0, le=100, description="Null while still learning the usual (fewer than 5 earlier days).")
  label: str
  resting_heart_rate: float | None
  usual_resting_heart_rate: float | None
  hrv_ms: float | None
  usual_hrv_ms: float | None


class HealthWeekDay(Schema):
  date: dt.date
  asleep_secs: int | None
  move_score: int | None
  workout_minutes: float


class HealthSummaryResponse(Schema):
  date: dt.date
  is_today: bool
  sleep: SleepDaySummary | None = Field(description="The night that ended on this date; null if none was recorded.")
  move: MoveDaySummary | None = Field(description="Null when there's no activity data at all yet.")
  energy: EnergyDaySummary | None = Field(description="Null when no heart data has been recorded (no Apple Watch).")
  insight: str = Field(description="One friendly sentence about the day.")
  bedtime_streak: int = Field(description="Nights in a row, ending this date, that began within 45 minutes of the usual bedtime.")
  week: list[HealthWeekDay] = Field(description="The seven days ending on this date, oldest first.")
