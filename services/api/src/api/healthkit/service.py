from datetime import UTC, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from api.healthkit.repository import HealthKitSleepSampleRepository, HealthKitWorkoutRepository
from api.healthkit.schemas import HealthKitSleepSyncRequest, HealthKitWorkoutSyncRequest


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


# Stages counted as "asleep" for totals and the daily grid. `inBed` and `awake`
# are excluded from asleep time; `inBed` is additionally dropped from segments
# entirely (see get_segments) since it's a coarse legacy category that would
# double-count against the granular stages some sources also report for the
# same window.
ASLEEP_STAGES = frozenset({"asleepUnspecified", "asleepCore", "asleepDeep", "asleepREM"})
EXCLUDED_STAGES = frozenset({"inBed"})


class SleepSegment:
  __slots__ = ("start_ts", "end_ts", "stage_name")

  def __init__(self, start_ts: int, end_ts: int, stage_name: str) -> None:
    self.start_ts = start_ts
    self.end_ts = end_ts
    self.stage_name = stage_name

  @property
  def duration(self) -> int:
    return self.end_ts - self.start_ts


def _local_night_bounds(ts: int, tz: ZoneInfo | None, tz_offset_mins: int) -> tuple[str, int]:
  """Return (wake_date, boundary_ts) for the sleep-night window containing `ts`.

  Nights are bucketed noon-to-noon rather than midnight-to-midnight, so a
  session that starts before local midnight and ends after it lands in a
  single bucket, and that bucket carries the wake date rather than the bed
  date.
  """
  if tz is not None:
    local = datetime.fromtimestamp(ts, tz=tz)
    noon = datetime(local.year, local.month, local.day, 12, tzinfo=tz)
    boundary = noon if local < noon else noon + timedelta(days=1)
    return boundary.date().isoformat(), int(boundary.timestamp())

  shifted = datetime.fromtimestamp(ts + tz_offset_mins * 60, tz=UTC)
  noon_shifted = datetime(shifted.year, shifted.month, shifted.day, 12, tzinfo=UTC)
  boundary_shifted = noon_shifted if shifted < noon_shifted else noon_shifted + timedelta(days=1)
  return boundary_shifted.date().isoformat(), int(boundary_shifted.timestamp()) - tz_offset_mins * 60


class HealthKitSleepService:
  async def sync(
    self,
    repo: HealthKitSleepSampleRepository,
    user_id: UUID,
    request: HealthKitSleepSyncRequest,
  ) -> tuple[int, int]:
    # Dedup by healthkit_uuid keeping the last occurrence: Postgres rejects an
    # upsert that affects the same row twice in one statement.
    deduped = {sample.healthkit_uuid: sample for sample in request.samples}
    rows = [{"user_id": user_id, **sample.model_dump()} for sample in deduped.values()]

    synced = await repo.upsert_batch(rows)
    deleted = await repo.soft_delete_by_healthkit_uuids(user_id, request.deleted_uuids)
    return synced, deleted

  async def get_segments(self, repo: HealthKitSleepSampleRepository, user_id: UUID, start_ts: int, end_ts: int) -> list[SleepSegment]:
    """Sleep segments within [start_ts, end_ts), clipped to the window.

    If multiple sources report overlapping samples for the same night (e.g.
    iPhone and Watch both logging sleep), seconds are summed without
    priority/dedup resolution — Apple's own Health app does real precedence
    handling here; that's out of scope for now.
    """
    samples = await repo.get_samples_in_range(user_id, start_ts, end_ts)
    segments: list[SleepSegment] = []
    for sample in samples:
      if sample.sleep_value_name in EXCLUDED_STAGES:
        continue
      seg_start = max(int(sample.start_date.timestamp()), start_ts)
      seg_end = min(int(sample.end_date.timestamp()), end_ts)
      if seg_end > seg_start:
        segments.append(SleepSegment(seg_start, seg_end, sample.sleep_value_name))
    return segments

  def split_by_local_night(self, segment: SleepSegment, tz: ZoneInfo | None, tz_offset_mins: int) -> list[tuple[str, int]]:
    """Split a segment into (wake_date, seconds) pairs at local-noon boundaries."""
    out: list[tuple[str, int]] = []
    cur = segment.start_ts
    while cur < segment.end_ts:
      wake_date, boundary_ts = _local_night_bounds(cur, tz, tz_offset_mins)
      boundary = min(boundary_ts, segment.end_ts)
      out.append((wake_date, boundary - cur))
      cur = boundary
    return out


healthkit_sleep_service = HealthKitSleepService()
