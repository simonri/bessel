from uuid import UUID

from api.healthkit.repository import HealthKitWorkoutRepository
from api.healthkit.schemas import HealthKitWorkoutSyncRequest


class HealthKitWorkoutService:
  async def sync(
    self,
    repo: HealthKitWorkoutRepository,
    user_id: UUID,
    request: HealthKitWorkoutSyncRequest,
  ) -> tuple[int, int]:
    # Dedup by healthkit_uuid keeping the last occurrence: Postgres rejects an
    # upsert that affects the same row twice in one statement.
    deduped = {workout.healthkit_uuid: workout for workout in request.workouts}
    rows = [{"user_id": user_id, **workout.model_dump()} for workout in deduped.values()]

    synced = await repo.upsert_batch(rows)
    deleted = await repo.soft_delete_by_healthkit_uuids(user_id, request.deleted_uuids)
    return synced, deleted


healthkit_workout_service = HealthKitWorkoutService()
