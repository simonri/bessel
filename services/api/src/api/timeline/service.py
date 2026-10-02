from uuid import UUID

from api.activity.repository import ActivityRepository
from api.activity.service import ActivityService
from api.healthkit.repository import HealthKitSleepSampleRepository
from api.healthkit.service import ASLEEP_STAGES, healthkit_sleep_service
from api.timeline.schemas import TimelineLane, TimelineLaneKey, TimelineResponse, TimelineSegment

Interval = tuple[int, int]


def _union(intervals: list[Interval]) -> list[Interval]:
  merged: list[Interval] = []
  for start, end in sorted(intervals):
    if merged and start <= merged[-1][1]:
      merged[-1] = (merged[-1][0], max(merged[-1][1], end))
    else:
      merged.append((start, end))
  return merged


def _total_secs(intervals: list[Interval]) -> int:
  return sum(end - start for start, end in _union(intervals))


def _merge_contiguous(segments: list[TimelineSegment]) -> list[TimelineSegment]:
  """Collapse back-to-back segments with the same label. Activity yields one
  segment per heartbeat, so an hour in one app would otherwise be a dozen."""
  merged: list[TimelineSegment] = []
  for seg in sorted(segments, key=lambda s: s.start_ts):
    last = merged[-1] if merged else None
    if last is not None and last.label == seg.label and seg.start_ts <= last.end_ts:
      last.end_ts = max(last.end_ts, seg.end_ts)
    else:
      merged.append(seg.model_copy())
  return merged


class TimelineService:
  async def get_timeline(
    self,
    activity_repo: ActivityRepository,
    sleep_repo: HealthKitSleepSampleRepository,
    user_id: UUID,
    start_ts: int,
    end_ts: int,
    source: str | None,
  ) -> TimelineResponse:
    sleep_segments = await healthkit_sleep_service.get_segments(sleep_repo, user_id, start_ts, end_ts)
    asleep = [(s.start_ts, s.end_ts) for s in sleep_segments if s.stage_name in ASLEEP_STAGES]
    sleep_lane = TimelineLane(
      key=TimelineLaneKey.sleep,
      total_secs=_total_secs(asleep),
      segments=_merge_contiguous([TimelineSegment(start_ts=s.start_ts, end_ts=s.end_ts, label=s.stage_name) for s in sleep_segments]),
    )

    if source is None:
      sources = await activity_repo.get_sources()
      source = sources[0] if sources else None

    active: list[Interval] = []
    pc_segments: list[TimelineSegment] = []
    if source is not None:
      for seg in await ActivityService().get_active_segments(activity_repo, source, start_ts, end_ts):
        active.append((seg.start_ts, seg.end_ts))
        pc_segments.append(TimelineSegment(start_ts=seg.start_ts, end_ts=seg.end_ts, label=seg.app_class or "(unknown)"))
    pc_lane = TimelineLane(key=TimelineLaneKey.pc, total_secs=_total_secs(active), segments=_merge_contiguous(pc_segments))

    return TimelineResponse(
      start_ts=start_ts,
      end_ts=end_ts,
      source=source,
      tracked_secs=_total_secs(asleep + active),
      lanes=[sleep_lane, pc_lane],
    )


timeline_service = TimelineService()
