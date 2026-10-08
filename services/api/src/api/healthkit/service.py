from collections.abc import Sequence
from datetime import UTC, date, datetime, time, timedelta, timezone
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
  SleepStageSegment,
  SleepStageSummary,
  SleepSummaryResponse,
)
from api.models.healthkit_daily_metric import HealthKitDailyMetric
from api.models.healthkit_sleep_sample import HealthKitSleepSample
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

# Sleep separated by less than this is one sleep: a brief waking (bathroom,
# rolling over) shouldn't start a new one.
EPISODE_MERGE_GAP_SECS = 90 * 60
# A sleep that ends from this hour on is the start of the coming night.
EVENING_HOUR = 18


class SleepSegment:
  __slots__ = ("start_ts", "end_ts", "stage_name")

  def __init__(self, start_ts: int, end_ts: int, stage_name: str) -> None:
    self.start_ts = start_ts
    self.end_ts = end_ts
    self.stage_name = stage_name

  @property
  def duration(self) -> int:
    return self.end_ts - self.start_ts


class SleepEpisode:
  """One continuous sleep, from one source, and the local day it ended on."""

  __slots__ = ("segments", "start_ts", "end_ts", "wake_date")

  def __init__(self, segments: list[SleepSegment], wake_date: str) -> None:
    asleep = [s for s in segments if s.stage_name in ASLEEP_STAGES]
    self.segments = segments
    self.start_ts = min(s.start_ts for s in asleep)
    self.end_ts = max(s.end_ts for s in asleep)
    self.wake_date = wake_date

  @property
  def asleep_secs(self) -> int:
    return sum(s.duration for s in self.segments if s.stage_name in ASLEEP_STAGES)


def _wake_date(ts: int, tz: ZoneInfo | None, tz_offset_mins: int) -> str:
  """The day a sleep ending at `ts` counts towards: the local day it ended on,
  or the next one if it ended in the evening, as the start of the coming night."""
  zone = tz or timezone(timedelta(minutes=tz_offset_mins))
  ended = datetime.fromtimestamp(ts, tz=zone)
  day = ended.date() + timedelta(days=1) if ended.hour >= EVENING_HOUR else ended.date()
  return day.isoformat()


def _local_noon(day: str, tz: ZoneInfo | None, tz_offset_mins: int) -> int:
  zone = tz or timezone(timedelta(minutes=tz_offset_mins))
  return int(datetime.combine(date.fromisoformat(day), time(12), tzinfo=zone).timestamp())


def local_iso(ts: int, tz: ZoneInfo | None, tz_offset_mins: int) -> str:
  """Format an epoch timestamp as a local ISO 8601 string with UTC offset —
  an AI (or anyone) reading a bare "21:40Z" would misjudge a 23:40 local
  bedtime, so onset/wake times are never returned in UTC."""
  if tz is not None:
    return datetime.fromtimestamp(ts, tz=tz).isoformat()
  return datetime.fromtimestamp(ts, tz=timezone(timedelta(minutes=tz_offset_mins))).isoformat()


STAGED_STAGES = frozenset({"asleepCore", "asleepDeep", "asleepREM"})


def _clusters(samples: Sequence[HealthKitSleepSample]) -> list[list[HealthKitSleepSample]]:
  """Samples from every source grouped into continuous sleeps, in time order."""
  clusters: list[list[HealthKitSleepSample]] = []
  cluster_end: datetime | None = None
  for sample in sorted(samples, key=lambda s: s.start_date):
    if cluster_end is None or (sample.start_date - cluster_end).total_seconds() > EPISODE_MERGE_GAP_SECS:
      clusters.append([])
      cluster_end = sample.end_date
    clusters[-1].append(sample)
    cluster_end = max(cluster_end, sample.end_date)
  return clusters


def _primary_source(cluster: list[HealthKitSleepSample]) -> list[HealthKitSleepSample]:
  """One source per sleep, like Apple Health does.

  An iPhone and a Watch, or a Watch and a sleep app, often record the same
  night; adding them up would count it twice. The source with the most deep,
  core and REM detail wins (usually the Watch), then the one with the most
  time asleep.
  """
  by_source: dict[str, list[HealthKitSleepSample]] = {}
  for sample in cluster:
    by_source.setdefault(sample.source_bundle_id, []).append(sample)

  def seconds(source_samples: list[HealthKitSleepSample], stages: frozenset[str]) -> float:
    return sum((s.end_date - s.start_date).total_seconds() for s in source_samples if s.sleep_value_name in stages)

  best = max(by_source, key=lambda source: (seconds(by_source[source], STAGED_STAGES), seconds(by_source[source], ASLEEP_STAGES)))
  return by_source[best]


def primary_source_samples(samples: Sequence[HealthKitSleepSample]) -> list[HealthKitSleepSample]:
  """Every sleep's samples from its one counted source, in time order."""
  return sorted((sample for cluster in _clusters(samples) for sample in _primary_source(cluster)), key=lambda s: s.start_date)


def _segments(samples: Sequence[HealthKitSleepSample], start_ts: int | None = None, end_ts: int | None = None) -> list[SleepSegment]:
  segments: list[SleepSegment] = []
  for sample in samples:
    if sample.sleep_value_name in EXCLUDED_STAGES:
      continue
    seg_start = int(sample.start_date.timestamp())
    seg_end = int(sample.end_date.timestamp())
    if start_ts is not None:
      seg_start = max(seg_start, start_ts)
    if end_ts is not None:
      seg_end = min(seg_end, end_ts)
    if seg_end > seg_start:
      segments.append(SleepSegment(seg_start, seg_end, sample.sleep_value_name))
  return segments


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
    """Sleep within [start_ts, end_ts) as it happened, clipped to the window,
    each sleep from its one counted source. For drawing a day as a timeline."""
    samples = await repo.get_samples_in_range(user_id, start_ts - EPISODE_MERGE_GAP_SECS, end_ts + EPISODE_MERGE_GAP_SECS)
    return _segments(primary_source_samples(samples), start_ts, end_ts)

  async def get_nights(
    self, repo: HealthKitSleepSampleRepository, user_id: UUID, start_ts: int, end_ts: int, tz: ZoneInfo | None, tz_offset_mins: int
  ) -> dict[str, list[SleepEpisode]]:
    """Sleeps by the local day they ended on, for the days whose noon falls in
    (start_ts, end_ts]: a window from noon to noon covers the night ending on
    the second day, as callers have always asked for it.

    A sleep is never split. Sleeping in past noon stays with that night, a nap
    counts towards the day it was taken on, and sleep that ends in the evening
    towards the night ahead.
    """
    # Wide enough to take in whole sleeps that end on these days.
    samples = await repo.get_samples_in_range(user_id, start_ts - 36 * 3600, end_ts + 12 * 3600)
    nights: dict[str, list[SleepEpisode]] = {}
    for cluster in _clusters(samples):
      segments = _segments(_primary_source(cluster))
      if not any(s.stage_name in ASLEEP_STAGES for s in segments):
        continue
      asleep_end = max(s.end_ts for s in segments if s.stage_name in ASLEEP_STAGES)
      wake_date = _wake_date(asleep_end, tz, tz_offset_mins)
      if start_ts < _local_noon(wake_date, tz, tz_offset_mins) <= end_ts:
        nights.setdefault(wake_date, []).append(SleepEpisode(segments, wake_date))
    return nights

  async def nightly_totals(
    self, repo: HealthKitSleepSampleRepository, user_id: UUID, start_ts: int, end_ts: int, tz: ZoneInfo | None, tz_offset_mins: int
  ) -> list[SleepDailyEntry]:
    """Time asleep per day, keyed by the local day each sleep ended on, with the
    longest sleep's onset and wake time."""
    nights = await self.get_nights(repo, user_id, start_ts, end_ts, tz, tz_offset_mins)
    entries = []
    for wake_date, episodes in nights.items():
      main = max(episodes, key=lambda e: e.end_ts - e.start_ts)
      entries.append(
        SleepDailyEntry(
          date=wake_date,
          asleep_secs=sum(e.asleep_secs for e in episodes),
          sleep_onset=local_iso(main.start_ts, tz, tz_offset_mins),
          wake_time=local_iso(main.end_ts, tz, tz_offset_mins),
        )
      )
    return sorted(entries, key=lambda x: x.date)

  async def stage_summary(
    self, repo: HealthKitSleepSampleRepository, user_id: UUID, start_ts: int, end_ts: int, tz: ZoneInfo | None = None, tz_offset_mins: int = 0
  ) -> SleepSummaryResponse:
    nights = await self.get_nights(repo, user_id, start_ts, end_ts, tz, tz_offset_mins)

    totals: dict[str, int] = {}
    total_asleep = 0
    total_span = 0
    for episodes in nights.values():
      for episode in episodes:
        for seg in episode.segments:
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
    episodes = (await healthkit_sleep_service.get_nights(repo, user_id, _local_noon_ts(day - timedelta(days=1), tz), _local_noon_ts(day, tz), tz, 0)).get(
      day.isoformat(), []
    )
    segments = sorted((segment for episode in episodes for segment in episode.segments), key=lambda segment: segment.start_ts)
    for segment in segments:
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
      segments=[
        SleepStageSegment(
          stage=segment.stage_name,
          start=datetime.fromtimestamp(segment.start_ts, tz=UTC),
          end=datetime.fromtimestamp(segment.end_ts, tz=UTC),
        )
        for segment in segments
      ],
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
