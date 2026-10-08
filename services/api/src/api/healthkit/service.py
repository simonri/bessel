from datetime import UTC, date, datetime, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from api.healthkit import scores
from api.healthkit.repository import HealthKitDailyMetricRepository, HealthKitSleepSampleRepository, HealthKitWorkoutRepository
from api.healthkit.schemas import (
  EnergyDaySummary,
  HealthKitDailyMetricsSyncRequest,
  HealthKitSleepSyncRequest,
  HealthKitWorkoutSyncRequest,
  HealthSummaryResponse,
  HealthWeekDay,
  MoveDaySummary,
  SleepDailyEntry,
  SleepDaySummary,
  SleepStageSummary,
  SleepSummaryResponse,
)
from api.models.healthkit_daily_metric import HealthKitDailyMetric
from api.models.healthkit_workout import HealthKitWorkout


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


class HealthKitDailyMetricService:
  async def sync(self, repo: HealthKitDailyMetricRepository, user_id: UUID, request: HealthKitDailyMetricsSyncRequest) -> int:
    deduped = {day.date: day for day in request.days}
    return await repo.upsert_batch([{"user_id": user_id, **day.model_dump()} for day in deduped.values()])


healthkit_daily_metric_service = HealthKitDailyMetricService()

# How far back the usuals look.
BASELINE_DAYS = 30
SLEEP_BASELINE_NIGHTS = 14
WEEK_DAYS = 7


def _local_noon_ts(day: date, tz: ZoneInfo) -> int:
  return int(datetime(day.year, day.month, day.day, 12, tzinfo=tz).timestamp())


def _local_midnight(day: date, tz: ZoneInfo) -> datetime:
  return datetime(day.year, day.month, day.day, tzinfo=tz)


def _onset_minutes(entry: SleepDailyEntry | None) -> float | None:
  if entry is None or entry.sleep_onset is None:
    return None
  return scores.minutes_of_day(datetime.fromisoformat(entry.sleep_onset))


class HealthSummaryService:
  """Builds one day's Health page: sleep, movement and energy against the person's
  own usual, the week around it and a sentence about it."""

  async def build(
    self,
    sleep_repo: HealthKitSleepSampleRepository,
    workout_repo: HealthKitWorkoutRepository,
    metric_repo: HealthKitDailyMetricRepository,
    user_id: UUID,
    day: date,
    tz: ZoneInfo,
    now: datetime,
  ) -> HealthSummaryResponse:
    is_today = day == now.astimezone(tz).date()
    week = [day - timedelta(days=offset) for offset in range(WEEK_DAYS - 1, -1, -1)]
    history_start = week[0] - timedelta(days=BASELINE_DAYS)

    nights = {
      date.fromisoformat(entry.date): entry
      for entry in await healthkit_sleep_service.nightly_totals(
        sleep_repo, user_id, _local_noon_ts(history_start - timedelta(days=1), tz), _local_noon_ts(day, tz), tz, 0
      )
    }
    metrics = {metric.date: metric for metric in await metric_repo.list_between(user_id, history_start, day)}
    workouts_by_day: dict[date, list[HealthKitWorkout]] = {}
    for workout in await workout_repo.list_started_between(user_id, _local_midnight(week[0], tz), _local_midnight(day + timedelta(days=1), tz)):
      workouts_by_day.setdefault(workout.start_date.astimezone(tz).date(), []).append(workout)

    sleep, sleep_score, usual_onset = await self._sleep(sleep_repo, user_id, day, tz, nights)
    move_by_day = {
      d: self._move(
        d, metrics, workouts_by_day.get(d, []), scores.waking_day_fraction(now.astimezone(tz)) if d == day and is_today else 1.0, is_today and d == day
      )
      for d in week
    }
    energy = self._energy(day, metrics, sleep_score, is_today)
    streak = scores.bedtime_streak([_onset_minutes(nights.get(day - timedelta(days=offset))) for offset in range(SLEEP_BASELINE_NIGHTS)], usual_onset)

    move = move_by_day[day]
    todays_workouts = workouts_by_day.get(day, [])
    facts = scores.DayFacts(
      is_today=is_today,
      asleep_secs=sleep.asleep_secs if sleep else None,
      usual_asleep_secs=sleep.usual_asleep_secs if sleep else None,
      energy_label=energy.label if energy and energy.score is not None else None,
      move_label=move.label if move else None,
      workout_count=len(todays_workouts),
      workout_minutes=sum(w.duration for w in todays_workouts) / 60,
      bedtime_streak=streak,
    )
    return HealthSummaryResponse(
      date=day,
      is_today=is_today,
      sleep=sleep,
      move=move,
      energy=energy,
      insight=scores.insight(facts),
      bedtime_streak=streak,
      week=[
        HealthWeekDay(
          date=d,
          asleep_secs=nights[d].asleep_secs if d in nights else None,
          move_score=day_move.score if (day_move := move_by_day[d]) else None,
          workout_minutes=sum(w.duration for w in workouts_by_day.get(d, [])) / 60,
        )
        for d in week
      ],
    )

  async def _sleep(
    self, repo: HealthKitSleepSampleRepository, user_id: UUID, day: date, tz: ZoneInfo, nights: dict[date, SleepDailyEntry]
  ) -> tuple[SleepDaySummary | None, int | None, float | None]:
    earlier = [nights[d] for offset in range(1, SLEEP_BASELINE_NIGHTS + 1) if (d := day - timedelta(days=offset)) in nights]
    usual_onset = scores.usual_time_of_day([m for entry in earlier if (m := _onset_minutes(entry)) is not None])
    night = nights.get(day)
    if night is None:
      return None, None, usual_onset

    stages: dict[str, int] = {}
    for segment in await healthkit_sleep_service.get_segments(repo, user_id, _local_noon_ts(day - timedelta(days=1), tz), _local_noon_ts(day, tz)):
      stages[segment.stage_name] = stages.get(segment.stage_name, 0) + segment.duration
    deep, core, rem = stages.get("asleepDeep", 0), stages.get("asleepCore", 0), stages.get("asleepREM", 0)

    usual_asleep = round(sum(e.asleep_secs for e in earlier) / len(earlier)) if len(earlier) >= scores.MIN_SLEEP_BASELINE_NIGHTS else None
    score = scores.sleep_score(night.asleep_secs, deep, rem, core, _onset_minutes(night), usual_onset)
    summary = SleepDaySummary(
      score=score,
      label=scores.sleep_label(score, night.asleep_secs),
      asleep_secs=night.asleep_secs,
      usual_asleep_secs=usual_asleep,
      sleep_onset=night.sleep_onset,
      wake_time=night.wake_time,
      deep_secs=deep,
      core_secs=core,
      rem_secs=rem,
      awake_secs=stages.get("awake", 0),
    )
    return summary, score, usual_onset

  def _move(
    self, day: date, metrics: dict[date, HealthKitDailyMetric], workouts: list[HealthKitWorkout], day_fraction: float, is_partial: bool
  ) -> MoveDaySummary | None:
    earlier = [metrics[d] for offset in range(1, BASELINE_DAYS + 1) if (d := day - timedelta(days=offset)) in metrics]
    energies = [m.active_energy_kcal for m in earlier if m.active_energy_kcal is not None]
    step_counts = [float(m.steps) for m in earlier if m.steps is not None]
    usual_energy = scores.mean(energies) if len(energies) >= scores.MIN_BASELINE_DAYS else None
    usual_steps = scores.mean(step_counts) if len(step_counts) >= scores.MIN_BASELINE_DAYS else None

    today = metrics.get(day)
    workout_minutes = sum(w.duration for w in workouts) / 60
    if today is None and not earlier and not workouts:
      return None

    result = scores.move_result(
      active_energy_kcal=today.active_energy_kcal if today else None,
      usual_active_energy_kcal=usual_energy,
      steps=today.steps if today else None,
      usual_steps=usual_steps,
      workout_minutes=workout_minutes,
      has_any_metrics=bool(earlier) or today is not None,
      day_fraction=day_fraction,
    )
    return MoveDaySummary(
      score=result.score,
      label=result.label,
      is_partial_day=is_partial,
      steps=today.steps if today else None,
      usual_steps=round(usual_steps) if usual_steps is not None else None,
      active_energy_kcal=today.active_energy_kcal if today else None,
      usual_active_energy_kcal=usual_energy,
      exercise_minutes=today.exercise_minutes if today else None,
      workout_count=len(workouts),
      workout_minutes=workout_minutes,
    )

  def _energy(self, day: date, metrics: dict[date, HealthKitDailyMetric], sleep_score: int | None, is_today: bool) -> EnergyDaySummary | None:
    earlier = [metrics[d] for offset in range(1, BASELINE_DAYS + 1) if (d := day - timedelta(days=offset)) in metrics]
    today = metrics.get(day)
    hrvs = [m.hrv_ms for m in earlier if m.hrv_ms is not None]
    resting = [m.resting_heart_rate for m in earlier if m.resting_heart_rate is not None]
    has_today = today is not None and (today.hrv_ms is not None or today.resting_heart_rate is not None)
    if not hrvs and not resting and not has_today:
      # No heart data at all: no Apple Watch, so no Energy ring.
      return None

    usual_hrv = scores.mean(hrvs) if len(hrvs) >= scores.MIN_BASELINE_DAYS else None
    usual_resting = scores.mean(resting) if len(resting) >= scores.MIN_BASELINE_DAYS else None
    hrv = today.hrv_ms if today else None
    resting_rate = today.resting_heart_rate if today else None
    score = scores.energy_score(hrv, usual_hrv, resting_rate, usual_resting, sleep_score)
    return EnergyDaySummary(
      score=score,
      label=scores.energy_label(score, has_usual=usual_hrv is not None or usual_resting is not None, is_today=is_today),
      resting_heart_rate=resting_rate,
      usual_resting_heart_rate=usual_resting,
      hrv_ms=hrv,
      usual_hrv_ms=usual_hrv,
    )


health_summary_service = HealthSummaryService()
