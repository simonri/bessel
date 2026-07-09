import time
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from api.activity.repository import ActivityRepository

# Events are written at most every HEARTBEAT_SECS (300s) by the tracker; cap
# inter-event gaps at 2x that so tracker downtime / suspend gaps don't inflate
# totals.
MAX_GAP_SECS = 600


class ActiveSegment:
  __slots__ = ("start_ts", "end_ts", "app_class")

  def __init__(self, start_ts: int, end_ts: int, app_class: str | None) -> None:
    self.start_ts = start_ts
    self.end_ts = end_ts
    self.app_class = app_class

  @property
  def duration(self) -> int:
    return self.end_ts - self.start_ts


def _local_day_bounds(ts: int, tz: ZoneInfo | None, tz_offset_mins: int) -> tuple[str, int]:
  """Return (date_str, day_end_ts) for the local calendar day containing `ts`."""
  if tz is not None:
    local = datetime.fromtimestamp(ts, tz=tz)
    day_start = datetime(local.year, local.month, local.day, tzinfo=tz)
    return local.date().isoformat(), int((day_start + timedelta(days=1)).timestamp())

  shifted = datetime.fromtimestamp(ts + tz_offset_mins * 60, tz=UTC)
  day_start_shifted = datetime(shifted.year, shifted.month, shifted.day, tzinfo=UTC)
  day_end_ts = int((day_start_shifted + timedelta(days=1)).timestamp()) - tz_offset_mins * 60
  return shifted.date().isoformat(), day_end_ts


class ActivityService:
  async def get_active_segments(self, repo: ActivityRepository, source: str, start_ts: int, end_ts: int) -> list[ActiveSegment]:
    """Active-time segments within [start_ts, end_ts), clipped to the window.

    Seeds the timeline with the last event before start_ts so a session that
    began before the window (e.g. one spanning midnight) is credited for the
    portion of it that falls inside the window, instead of being silently
    dropped.
    """
    events = await repo.get_events_in_range(start_ts, end_ts, source)
    leading = await repo.get_last_event_before(start_ts, source)
    timeline = ([leading] if leading is not None else []) + events

    tail_ts = min(int(time.time()), end_ts)

    segments: list[ActiveSegment] = []
    for i, event in enumerate(timeline):
      if event.state != "active":
        continue
      nxt_ts = timeline[i + 1].ts if i + 1 < len(timeline) else tail_ts
      seg_start = max(event.ts, start_ts)
      seg_end = min(event.ts + MAX_GAP_SECS, nxt_ts, end_ts)
      if seg_end > seg_start:
        segments.append(ActiveSegment(seg_start, seg_end, event.app_class))
    return segments

  def split_by_local_day(self, segment: ActiveSegment, tz: ZoneInfo | None, tz_offset_mins: int) -> list[tuple[str, int]]:
    """Split a segment into (date, seconds) pairs at local-midnight boundaries.

    A segment is at most MAX_GAP_SECS long, so it can only ever straddle a
    single day boundary, but the loop handles the general case.
    """
    out: list[tuple[str, int]] = []
    cur = segment.start_ts
    while cur < segment.end_ts:
      date_str, day_end_ts = _local_day_bounds(cur, tz, tz_offset_mins)
      boundary = min(day_end_ts, segment.end_ts)
      out.append((date_str, boundary - cur))
      cur = boundary
    return out
