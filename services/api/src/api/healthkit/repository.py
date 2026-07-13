from typing import Any
from uuid import UUID

from sqlalchemy import Select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.common.utils import utc_now
from api.models.healthkit_workout import HealthKitWorkout

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
