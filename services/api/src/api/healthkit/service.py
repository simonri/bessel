from datetime import UTC, datetime, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from api.healthkit.repository import HealthKitSleepSampleRepository, HealthKitWorkoutRepository
from api.healthkit.schemas import HealthKitSleepSyncRequest, HealthKitWorkoutSyncRequest, SleepDailyEntry, SleepStageSummary, SleepSummaryResponse


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

# Segments separated by less than this count as one continuous sleep episode —
# a brief nighttime waking (bathroom, rolling over) shouldn't read as a fresh
# bedtime. Only affects onset/wake-time reporting; duration totals are
# unaffected (they sum every asleep segment regardless of gaps).
EPISODE_MERGE_GAP_SECS = 90 * 60


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


def local_iso(ts: int, tz: ZoneInfo | None, tz_offset_mins: int) -> str:
  """Format an epoch timestamp as a local ISO 8601 string with UTC offset —
  an AI (or anyone) reading a bare "21:40Z" would misjudge a 23:40 local
  bedtime, so onset/wake times are never returned in UTC."""
  if tz is not None:
    return datetime.fromtimestamp(ts, tz=tz).isoformat()
  return datetime.fromtimestamp(ts, tz=timezone(timedelta(minutes=tz_offset_mins))).isoformat()


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

  def nightly_episodes(self, segments: list[SleepSegment], tz: ZoneInfo | None, tz_offset_mins: int) -> dict[str, tuple[int, int]]:
    """For each wake-date, the (start_ts, end_ts) of that night's longest
    unbroken sleep episode — for reporting an actual bedtime/wake-up time.

    Unlike split_by_local_night (used for duration totals), segments are
    bucketed by their own start time, not fragmented at the noon boundary: a
    sample that starts at 23:00 and ends at 07:00 is one segment with one
    real start time, and splitting it would make the wake-date bucket's
    "start" land exactly on a noon boundary rather than an actual bedtime. A
    segment that starts before a nap-friendly local noon and one that starts
    after both land in whichever single night their own start time belongs
    to, which is correct for every ordinary (non-24h-spanning) sleep sample.
    """
    by_night: dict[str, list[SleepSegment]] = {}
    for seg in segments:
      if seg.stage_name not in ASLEEP_STAGES:
        continue
      wake_date, _ = _local_night_bounds(seg.start_ts, tz, tz_offset_mins)
      by_night.setdefault(wake_date, []).append(seg)

    result: dict[str, tuple[int, int]] = {}
    for wake_date, night_segments in by_night.items():
      night_segments.sort(key=lambda s: s.start_ts)
      episodes: list[tuple[int, int]] = []
      cur_start, cur_end = night_segments[0].start_ts, night_segments[0].end_ts
      for seg in night_segments[1:]:
        if seg.start_ts - cur_end <= EPISODE_MERGE_GAP_SECS:
          cur_end = max(cur_end, seg.end_ts)
        else:
          episodes.append((cur_start, cur_end))
          cur_start, cur_end = seg.start_ts, seg.end_ts
      episodes.append((cur_start, cur_end))
      result[wake_date] = max(episodes, key=lambda e: e[1] - e[0])
    return result

  async def nightly_totals(
    self, repo: HealthKitSleepSampleRepository, user_id: UUID, start_ts: int, end_ts: int, tz: ZoneInfo | None, tz_offset_mins: int
  ) -> list[SleepDailyEntry]:
    """Time asleep per night, keyed by local wake date, with the main episode's onset and wake time."""
    segments = await self.get_segments(repo, user_id, start_ts, end_ts)

    nightly: dict[str, int] = {}
    for seg in segments:
      if seg.stage_name not in ASLEEP_STAGES:
        continue
      for wake_date, secs in self.split_by_local_night(seg, tz, tz_offset_mins):
        nightly[wake_date] = nightly.get(wake_date, 0) + secs

    episodes = self.nightly_episodes(segments, tz, tz_offset_mins)
    return sorted(
      [
        SleepDailyEntry(
          date=k,
          asleep_secs=v,
          sleep_onset=local_iso(episodes[k][0], tz, tz_offset_mins) if k in episodes else None,
          wake_time=local_iso(episodes[k][1], tz, tz_offset_mins) if k in episodes else None,
        )
        for k, v in nightly.items()
      ],
      key=lambda x: x.date,
    )

  async def stage_summary(self, repo: HealthKitSleepSampleRepository, user_id: UUID, start_ts: int, end_ts: int) -> SleepSummaryResponse:
    segments = await self.get_segments(repo, user_id, start_ts, end_ts)

    totals: dict[str, int] = {}
    total_asleep = 0
    total_span = 0
    for seg in segments:
      totals[seg.stage_name] = totals.get(seg.stage_name, 0) + seg.duration
      total_span += seg.duration
      if seg.stage_name in ASLEEP_STAGES:
        total_asleep += seg.duration

    stages = sorted(
      [SleepStageSummary(stage=k, secs=v, percentage=v / total_span * 100 if total_span > 0 else 0.0) for k, v in totals.items()],
      key=lambda x: -x.secs,
    )
    return SleepSummaryResponse(total_asleep_secs=total_asleep, stages=stages)


healthkit_sleep_service = HealthKitSleepService()
