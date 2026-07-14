from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.common.utils import utc_now
from api.models.healthkit_sleep_sample import HealthKitSleepSample
from api.models.healthkit_workout import HealthKitWorkout

SLEEP_UPSERT_COLUMNS = [
  "sleep_value",
  "sleep_value_name",
  "start_date",
  "end_date",
  "source_name",
  "source_bundle_id",
  "source_version",
  "device_name",
  "sample_metadata",
]

UPSERT_COLUMNS = [
  "workout_activity_type",
  "workout_activity_type_name",
  "start_date",
  "end_date",
  "duration",
  "total_energy_burned",
  "total_distance",
  "source_name",
  "source_bundle_id",
  "source_version",
  "device_name",
  "workout_metadata",
  "statistics",
]


class HealthKitWorkoutRepository(RepositoryBase[HealthKitWorkout], RepositoryIDMixin[HealthKitWorkout, UUID]):
  model = HealthKitWorkout

  async def upsert_batch(self, rows: list[dict[str, Any]]) -> int:
    if not rows:
      return 0
    statement = pg_insert(HealthKitWorkout).values(rows)
    statement = statement.on_conflict_do_update(
      constraint="healthkit_workouts_user_id_healthkit_uuid_key",
      set_={
        **{column: statement.excluded[column] for column in UPSERT_COLUMNS},
        "modified_at": utc_now(),
        # A re-synced workout that was wrongly tombstoned should come back.
        "deleted_at": None,
      },
    )
    result = await self.session.execute(statement)
    return result.rowcount

  async def soft_delete_by_healthkit_uuids(self, user_id: UUID, healthkit_uuids: list[UUID]) -> int:
    if not healthkit_uuids:
      return 0
    statement = (
      update(HealthKitWorkout)
      .where(
        HealthKitWorkout.user_id == user_id,
        HealthKitWorkout.healthkit_uuid.in_(healthkit_uuids),
        HealthKitWorkout.deleted_at.is_(None),
      )
      .values(deleted_at=utc_now(), modified_at=utc_now())
    )
    result = await self.session.execute(statement)
    return result.rowcount

  def get_list_statement(self, user_id: UUID) -> Select[tuple[HealthKitWorkout]]:
    return (
      self.get_base_statement().where(HealthKitWorkout.user_id == user_id, HealthKitWorkout.deleted_at.is_(None)).order_by(HealthKitWorkout.start_date.desc())
    )


class HealthKitSleepSampleRepository(RepositoryBase[HealthKitSleepSample], RepositoryIDMixin[HealthKitSleepSample, UUID]):
  model = HealthKitSleepSample

  async def upsert_batch(self, rows: list[dict[str, Any]]) -> int:
    if not rows:
      return 0
    statement = pg_insert(HealthKitSleepSample).values(rows)
    statement = statement.on_conflict_do_update(
      constraint="healthkit_sleep_samples_user_id_healthkit_uuid_key",
      set_={
        **{column: statement.excluded[column] for column in SLEEP_UPSERT_COLUMNS},
        "modified_at": utc_now(),
        # A re-synced sample that was wrongly tombstoned should come back.
        "deleted_at": None,
      },
    )
    result = await self.session.execute(statement)
    return result.rowcount

  async def soft_delete_by_healthkit_uuids(self, user_id: UUID, healthkit_uuids: list[UUID]) -> int:
    if not healthkit_uuids:
      return 0
    statement = (
      update(HealthKitSleepSample)
      .where(
        HealthKitSleepSample.user_id == user_id,
        HealthKitSleepSample.healthkit_uuid.in_(healthkit_uuids),
        HealthKitSleepSample.deleted_at.is_(None),
      )
      .values(deleted_at=utc_now(), modified_at=utc_now())
    )
    result = await self.session.execute(statement)
    return result.rowcount

  def get_list_statement(self, user_id: UUID) -> Select[tuple[HealthKitSleepSample]]:
    return (
      self.get_base_statement()
      .where(HealthKitSleepSample.user_id == user_id, HealthKitSleepSample.deleted_at.is_(None))
      .order_by(HealthKitSleepSample.start_date.desc())
    )

  async def get_samples_in_range(self, user_id: UUID, start_ts: int, end_ts: int) -> Sequence[HealthKitSleepSample]:
    """Samples overlapping [start_ts, end_ts), ordered by start_date."""
    start_dt = datetime.fromtimestamp(start_ts, tz=UTC)
    end_dt = datetime.fromtimestamp(end_ts, tz=UTC)
    statement = (
      self.get_base_statement()
      .where(
        HealthKitSleepSample.user_id == user_id,
        HealthKitSleepSample.deleted_at.is_(None),
        HealthKitSleepSample.start_date < end_dt,
        HealthKitSleepSample.end_date > start_dt,
      )
      .order_by(HealthKitSleepSample.start_date)
    )
    return await self.get_all(statement)
