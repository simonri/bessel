"""Reads a Google Maps Timeline export (the on-device "Export Timeline data"
file) into normalized segments.

Two shapes exist: iOS writes a bare array of segments with "geo:lat,lng"
strings and numbers as strings; Android wraps them in {"semanticSegments": …}
with "lat°, lng°" strings, real numbers and separate UTC offset fields.
"""

import bisect
import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from api.exceptions import ValidationError
from api.models.location_segment import LocationSegmentKind

_GEO = re.compile(r"^\s*(?:geo:)?\s*(-?\d+(?:\.\d+)?)°?\s*,\s*(-?\d+(?:\.\d+)?)°?\s*$")
_COORD_DIGITS = 6

type LatLng = tuple[float, float]


class TimelineFormatError(ValidationError):
  def __init__(self, message: str) -> None:
    super().__init__(message, status_code=422)


@dataclass(slots=True)
class ParsedSegment:
  kind: LocationSegmentKind
  start_at: datetime
  end_at: datetime
  utc_offset_minutes: int | None
  place_id: str | None = None
  semantic_type: str | None = None
  hierarchy_level: int | None = None
  location: LatLng | None = None
  activity_type: str | None = None
  distance_meters: float | None = None
  start_location: LatLng | None = None
  end_location: LatLng | None = None
  # [lat, lng, unix seconds]
  points: list[list[float]] | None = None
  key: str = field(init=False, default="")
  content_hash: str = field(init=False, default="")

  def __post_init__(self) -> None:
    self.key = _digest([self.kind.value, _ms(self.start_at), _ms(self.end_at), self.hierarchy_level])

  def seal(self) -> None:
    """Fingerprints what the segment says, once its offset is final.

    Confidence scores are left out: Google recomputes them freely, and a
    re-scored but otherwise identical segment is not an edit.
    """
    self.content_hash = _digest(
      [
        self.utc_offset_minutes,
        self.place_id,
        self.semantic_type,
        self.location,
        self.activity_type,
        None if self.distance_meters is None else round(self.distance_meters),
        self.start_location,
        self.end_location,
        self.points,
      ]
    )


@dataclass(slots=True)
class ParsedTimeline:
  format: str
  segments: list[ParsedSegment]

  @property
  def range_start(self) -> datetime | None:
    return min((s.start_at for s in self.segments), default=None)

  @property
  def range_end(self) -> datetime | None:
    return max((s.end_at for s in self.segments), default=None)


def _digest(parts: list[Any]) -> str:
  return hashlib.sha256(json.dumps(parts, separators=(",", ":")).encode()).hexdigest()


def _ms(value: datetime) -> int:
  return round(value.timestamp() * 1000)


def _number(value: Any) -> float | None:
  if value is None or value == "" or isinstance(value, bool):
    return None
  try:
    return float(value)
  except (TypeError, ValueError):
    return None


def _geo(value: Any) -> LatLng | None:
  """Accepts "geo:59.3,18.0", "59.3°, 18.0°" or Android's {"latLng": …}."""
  if isinstance(value, dict):
    value = value.get("latLng")
  if not isinstance(value, str):
    return None
  match = _GEO.match(value)
  if match is None:
    return None
  lat, lng = float(match[1]), float(match[2])
  if not (-90 <= lat <= 90 and -180 <= lng <= 180):
    return None
  return round(lat, _COORD_DIGITS), round(lng, _COORD_DIGITS)


def _time(value: Any) -> datetime | None:
  if not isinstance(value, str):
    return None
  try:
    parsed = datetime.fromisoformat(value)
  except ValueError:
    return None
  return parsed if parsed.tzinfo is not None else None


def _offset_minutes(raw: dict[str, Any], start: datetime) -> int | None:
  explicit = _number(raw.get("startTimeTimezoneUtcOffsetMinutes"))
  if explicit is not None:
    return int(explicit)
  # iOS writes timeline paths in UTC ("Z"), which says nothing about where
  # they happened; a real +00:00 place is written as "+00:00".
  if str(raw.get("startTime", "")).endswith("Z"):
    return None
  offset = start.utcoffset()
  return None if offset is None else int(offset.total_seconds() // 60)


def _path_points(raw: list[Any], start: datetime) -> list[list[float]]:
  points: list[list[float]] = []
  for item in raw:
    if not isinstance(item, dict):
      continue
    location = _geo(item.get("point"))
    if location is None:
      continue
    at = _time(item.get("time"))
    if at is None:
      minutes = _number(item.get("durationMinutesOffsetFromStartTime"))
      if minutes is None:
        continue
      at = start + timedelta(minutes=minutes)
    points.append([location[0], location[1], int(at.timestamp())])
  points.sort(key=lambda p: p[2])
  return points


def _candidate(container: dict[str, Any]) -> dict[str, Any]:
  candidate = container.get("topCandidate")
  return candidate if isinstance(candidate, dict) else {}


def _segment(raw: Any) -> ParsedSegment | None:
  if not isinstance(raw, dict):
    return None
  start, end = _time(raw.get("startTime")), _time(raw.get("endTime"))
  if start is None or end is None or end < start:
    return None
  offset = _offset_minutes(raw, start)
  base = {"start_at": start.astimezone(UTC), "end_at": end.astimezone(UTC), "utc_offset_minutes": offset}

  if isinstance(visit := raw.get("visit"), dict):
    candidate = _candidate(visit)
    level = _number(visit.get("hierarchyLevel"))
    return ParsedSegment(
      kind=LocationSegmentKind.visit,
      **base,
      place_id=candidate.get("placeID") or candidate.get("placeId") or None,
      semantic_type=candidate.get("semanticType") or None,
      hierarchy_level=int(level) if level is not None else 0,
      location=_geo(candidate.get("placeLocation")),
    )
  if isinstance(activity := raw.get("activity"), dict):
    return ParsedSegment(
      kind=LocationSegmentKind.activity,
      **base,
      activity_type=_candidate(activity).get("type") or None,
      distance_meters=_number(activity.get("distanceMeters")),
      start_location=_geo(activity.get("start")),
      end_location=_geo(activity.get("end")),
    )
  if isinstance(path := raw.get("timelinePath"), list):
    points = _path_points(path, start)
    return ParsedSegment(kind=LocationSegmentKind.path, **base, points=points) if points else None
  # Memories, trip summaries and kinds Google adds later carry no places.
  return None


def _fill_offsets(segments: list[ParsedSegment]) -> None:
  """Gives segments without a UTC offset (iOS paths) the offset of the
  closest segment that has one, so they land on the right local day."""
  known = sorted((s.start_at, s.utc_offset_minutes) for s in segments if s.utc_offset_minutes is not None)
  starts = [at for at, _ in known]
  for segment in segments:
    if segment.utc_offset_minutes is not None or not known:
      continue
    i = bisect.bisect_left(starts, segment.start_at)
    nearby = [known[j] for j in (i - 1, i) if 0 <= j < len(known)]
    segment.utc_offset_minutes = min(nearby, key=lambda k: abs(k[0] - segment.start_at))[1]


def _raw_segments(data: Any) -> tuple[str, list[Any]]:
  if isinstance(data, list):
    return "ios", data
  if isinstance(data, dict):
    if isinstance(data.get("semanticSegments"), list):
      return "android", data["semanticSegments"]
    if "timelineObjects" in data or "locations" in data:
      raise TimelineFormatError("This is an old Google Takeout Location History file. Export Timeline data from the Google Maps app on your phone instead.")
  raise TimelineFormatError("Not a Google Timeline export. Expected the Timeline.json from your phone's Export Timeline data.")


def parse_timeline(content: bytes) -> ParsedTimeline:
  try:
    data = json.loads(content)
  except (UnicodeDecodeError, json.JSONDecodeError) as e:
    raise TimelineFormatError("The file isn't valid JSON.") from e
  format_, raw = _raw_segments(data)

  # A segment that appears twice in one file is the same segment.
  by_key: dict[str, ParsedSegment] = {}
  for segment in filter(None, map(_segment, raw)):
    by_key.setdefault(segment.key, segment)
  segments = list(by_key.values())
  if raw and not segments:
    raise TimelineFormatError("The file has no visits, trips or routes that could be read.")

  _fill_offsets(segments)
  for segment in segments:
    segment.seal()
  return ParsedTimeline(format=format_, segments=sorted(segments, key=lambda s: (s.start_at, s.kind.value)))
