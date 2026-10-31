import gzip
import hashlib
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from api.common.file_storage import file_storage
from api.location_history import place_names
from api.location_history.merge import StoredSegment, plan_merge
from api.location_history.parser import TimelineFormatError, parse_timeline
from api.models.location_import import LocationImport
from api.models.location_segment import LocationSegment
from api.postgres import AsyncSession
from api.settings import Environment, settings
from httpx import AsyncClient
from sqlalchemy import select

STOCKHOLM = "+02:00"
HOME = "geo:59.334591,18.063240"
OFFICE = "geo:59.329323,18.068581"


def _visit(start: str, end: str, place: str = "home-id", location: str = HOME, level: str = "0") -> dict[str, Any]:
  return {
    "startTime": start,
    "endTime": end,
    "visit": {
      "hierarchyLevel": level,
      "probability": "0.9",
      "topCandidate": {"placeID": place, "semanticType": "Unknown", "probability": "0.8", "placeLocation": location},
    },
  }


def _trip(start: str, end: str, kind: str = "walking") -> dict[str, Any]:
  return {
    "startTime": start,
    "endTime": end,
    "activity": {"start": HOME, "end": OFFICE, "distanceMeters": "812.5", "probability": "0.9", "topCandidate": {"type": kind, "probability": "0.7"}},
  }


def _path(start: str, end: str, points: list[tuple[str, int]]) -> dict[str, Any]:
  return {
    "startTime": start,
    "endTime": end,
    "timelinePath": [{"point": point, "durationMinutesOffsetFromStartTime": str(minutes)} for point, minutes in points],
  }


def _day(day: int) -> list[dict[str, Any]]:
  """A September day in Stockholm: home, walk to the office, office."""
  d = f"2026-09-{day:02d}"
  return [
    _visit(f"{d}T00:00:00.000{STOCKHOLM}", f"{d}T08:00:00.000{STOCKHOLM}"),
    _trip(f"{d}T08:00:00.000{STOCKHOLM}", f"{d}T08:20:00.000{STOCKHOLM}"),
    _visit(f"{d}T08:20:00.000{STOCKHOLM}", f"{d}T17:00:00.000{STOCKHOLM}", place="office-id", location=OFFICE),
    _path(f"{d}T06:00:00.000Z", f"{d}T08:00:00.000Z", [(HOME, 1), (OFFICE, 20)]),
  ]


def _export(*days: int) -> list[dict[str, Any]]:
  return [segment for day in days for segment in _day(day)]


def _bytes(data: Any) -> bytes:
  return json.dumps(data).encode()


async def _import(client: AsyncClient, data: Any, status: int = 200, exported_at: str | None = None) -> dict[str, Any]:
  params = {"exported_at": exported_at} if exported_at else {}
  resp = await client.post("/v1/location-history/import", params=params, files={"file": ("Timeline.json", _bytes(data), "application/json")})
  assert resp.status_code == status, resp.text
  return resp.json()


def _counts(result: dict[str, Any]) -> tuple[int, int, int, int, int]:
  return result["added"], result["updated"], result["removed"], result["unchanged"], result["stale"]


async def _day_view(client: AsyncClient, date: str) -> dict[str, Any]:
  resp = await client.get("/v1/location-history/day", params={"date": date})
  assert resp.status_code == 200, resp.text
  return resp.json()


@pytest.fixture(autouse=True)
def _no_place_names(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(place_names.settings, "GOOGLE_PLACES_API_KEY", "")
  place_names.clear_cache()


class TestParser:
  def test_reads_ios_export(self) -> None:
    timeline = parse_timeline(_bytes(_export(1)))
    assert timeline.format == "ios"
    visit, trip, path, office = sorted(timeline.segments, key=lambda s: (s.start_at, s.kind.value != "visit"))[:4]
    assert visit.kind == "visit" and visit.place_id == "home-id" and visit.location == (59.334591, 18.06324)
    assert visit.utc_offset_minutes == 120
    assert trip.kind == "activity" and trip.activity_type == "walking" and trip.distance_meters == 812.5
    assert trip.start_location == (59.334591, 18.06324)
    assert office.place_id == "office-id"
    path = next(s for s in timeline.segments if s.kind == "path")
    start = int(datetime(2026, 9, 1, 6, tzinfo=UTC).timestamp())
    assert path.points == [[59.334591, 18.06324, start + 60], [59.329323, 18.068581, start + 1200]]

  def test_utc_paths_take_the_offset_of_nearby_segments(self) -> None:
    timeline = parse_timeline(_bytes(_export(1)))
    path = next(s for s in timeline.segments if s.kind == "path")
    assert path.utc_offset_minutes == 120

  def test_reads_android_export(self) -> None:
    data = {
      "semanticSegments": [
        {
          "startTime": "2026-09-01T10:00:00.000+02:00",
          "endTime": "2026-09-01T11:00:00.000+02:00",
          "startTimeTimezoneUtcOffsetMinutes": 120,
          "endTimeTimezoneUtcOffsetMinutes": 120,
          "visit": {
            "hierarchyLevel": 0,
            "probability": 0.9,
            "topCandidate": {"placeId": "p1", "semanticType": "HOME", "placeLocation": {"latLng": "59.3°, 18.0°"}},
          },
        },
        {
          "startTime": "2026-09-01T11:00:00.000+02:00",
          "endTime": "2026-09-01T11:30:00.000+02:00",
          "activity": {"start": {"latLng": "59.3°, 18.0°"}, "end": {"latLng": "59.4°, 18.1°"}, "distanceMeters": 1500.0, "topCandidate": {"type": "CYCLING"}},
        },
        {
          "startTime": "2026-09-01T09:00:00.000Z",
          "endTime": "2026-09-01T11:00:00.000Z",
          "timelinePath": [{"point": "59.35°, 18.05°", "time": "2026-09-01T11:10:00.000+02:00"}],
        },
      ],
      "rawSignals": [{"position": {}}],
      "userLocationProfile": {},
    }
    timeline = parse_timeline(_bytes(data))
    assert timeline.format == "android"
    visit, trip, path = (next(s for s in timeline.segments if s.kind == kind) for kind in ("visit", "activity", "path"))
    assert (visit.place_id, visit.semantic_type, visit.location, visit.utc_offset_minutes) == ("p1", "HOME", (59.3, 18.0), 120)
    assert (trip.activity_type, trip.distance_meters, trip.end_location) == ("CYCLING", 1500.0, (59.4, 18.1))
    assert path.points == [[59.35, 18.05, int(datetime(2026, 9, 1, 9, 10, tzinfo=UTC).timestamp())]]
    assert path.utc_offset_minutes == 120

  def test_probability_changes_are_not_edits(self) -> None:
    original = _export(1)
    rescored = json.loads(json.dumps(original))
    rescored[0]["visit"]["probability"] = "0.1"
    rescored[0]["visit"]["topCandidate"]["probability"] = "0.2"
    a, b = parse_timeline(_bytes(original)), parse_timeline(_bytes(rescored))
    assert [(s.key, s.content_hash) for s in a.segments] == [(s.key, s.content_hash) for s in b.segments]

  def test_nested_visit_with_same_times_is_its_own_segment(self) -> None:
    outer = _visit("2026-09-01T10:00:00.000+02:00", "2026-09-01T11:00:00.000+02:00", place="mall")
    inner = _visit("2026-09-01T10:00:00.000+02:00", "2026-09-01T11:00:00.000+02:00", place="shop", level="1")
    assert len(parse_timeline(_bytes([outer, inner])).segments) == 2

  def test_duplicates_in_one_file_collapse(self) -> None:
    assert len(parse_timeline(_bytes(_export(1) + _export(1))).segments) == 4

  def test_counts_unreadable_segments_but_not_kinds_without_places(self) -> None:
    unreadable = {"startTime": "nope", "endTime": "nope", "visit": {}}
    backwards = _visit("2026-09-01T12:00:00.000+02:00", "2026-09-01T11:00:00.000+02:00")
    memory = {"startTime": "2026-09-01T10:00:00Z", "endTime": "2026-09-01T11:00:00Z", "timelineMemory": {}}
    timeline = parse_timeline(_bytes([*_export(1), unreadable, backwards, memory]))
    assert (len(timeline.segments), timeline.unreadable) == (4, 2)

  def test_route_with_an_unreadable_point_is_unreadable(self) -> None:
    broken = _path("2026-09-01T06:00:00.000Z", "2026-09-01T08:00:00.000Z", [(HOME, 1)])
    broken["timelinePath"].append({"point": "somewhere", "durationMinutesOffsetFromStartTime": "5"})
    timeline = parse_timeline(_bytes([*_export(1), broken]))
    assert timeline.unreadable == 1
    assert len([s for s in timeline.segments if s.kind == "path"]) == 1

  def test_empty_route_is_neither_a_segment_nor_unreadable(self) -> None:
    timeline = parse_timeline(_bytes([*_export(1), _path("2026-09-01T10:00:00.000Z", "2026-09-01T12:00:00.000Z", [])]))
    assert (len(timeline.segments), timeline.unreadable) == (4, 0)

  def test_reads_the_end_offset_of_a_trip_across_time_zones(self) -> None:
    flight = _trip("2026-09-01T23:00:00.000+09:00", "2026-09-01T22:00:00.000-07:00", kind="flying")
    android = {
      "semanticSegments": [
        {
          "startTime": "2026-09-01T10:00:00.000+02:00",
          "endTime": "2026-09-01T10:30:00.000+01:00",
          "startTimeTimezoneUtcOffsetMinutes": 120,
          "endTimeTimezoneUtcOffsetMinutes": 60,
          "activity": {"topCandidate": {"type": "FLYING"}},
        }
      ]
    }
    (ios,) = parse_timeline(_bytes([flight])).segments
    (andr,) = parse_timeline(_bytes(android)).segments
    assert (ios.utc_offset_minutes, ios.end_utc_offset_minutes) == (540, -420)
    assert (andr.utc_offset_minutes, andr.end_utc_offset_minutes) == (120, 60)

  def test_end_offset_leaves_fingerprints_alone_within_one_time_zone(self) -> None:
    """Rows stored before end offsets were read must not all count as edited."""
    (visit,) = parse_timeline(_bytes([_visit("2026-09-01T10:00:00.000+02:00", "2026-09-01T11:00:00.000+02:00")])).segments
    before = [120, "home-id", "Unknown", [59.334591, 18.06324], None, None, None, None, None]
    assert visit.content_hash == hashlib.sha256(json.dumps(before, separators=(",", ":")).encode()).hexdigest()

  def test_different_segments_with_the_same_times_are_both_kept(self) -> None:
    first = _visit("2026-09-01T10:00:00.000+02:00", "2026-09-01T11:00:00.000+02:00", place="cafe")
    second = _visit("2026-09-01T10:00:00.000+02:00", "2026-09-01T11:00:00.000+02:00", place="shop")
    a = parse_timeline(_bytes([first, second])).segments
    b = parse_timeline(_bytes([second, first])).segments
    assert sorted(s.place_id or "" for s in a) == ["cafe", "shop"]
    assert {(s.key, s.place_id) for s in a} == {(s.key, s.place_id) for s in b}

  @pytest.mark.parametrize(
    ("content", "message"),
    [
      (b"{not json", "valid JSON"),
      (_bytes({"timelineObjects": []}), "old Google Takeout"),
      (_bytes({"locations": []}), "old Google Takeout"),
      (_bytes({"hello": "world"}), "Not a Google Timeline export"),
      (_bytes([{"foo": 1}]), "no visits, trips or routes"),
    ],
  )
  def test_rejects_other_files(self, content: bytes, message: str) -> None:
    with pytest.raises(TimelineFormatError, match=message):
      parse_timeline(content)


def _stored(segment: Any, observed_at: datetime, *, deleted: bool = False, content_hash: str | None = None) -> StoredSegment:
  return StoredSegment(
    key=segment.key,
    content_hash=content_hash or segment.content_hash,
    observed_at=observed_at,
    deleted=deleted,
    start_at=segment.start_at,
    end_at=segment.end_at,
  )


class TestPlanMerge:
  def _timeline(self, *days: int) -> Any:
    return parse_timeline(_bytes(_export(*days)))

  def _plan(self, timeline: Any, stored: dict[str, StoredSegment]) -> Any:
    return plan_merge(timeline.segments, stored, timeline.range_end, timeline.range_start, timeline.range_end)

  def test_new_segments_are_added(self) -> None:
    plan = self._plan(self._timeline(1), {})
    assert (plan.added, plan.updated, plan.unchanged, plan.removed, plan.stale) == (4, 0, 0, [], 0)

  def test_same_export_changes_nothing(self) -> None:
    timeline = self._timeline(1)
    stored = {s.key: _stored(s, timeline.range_end) for s in timeline.segments}
    plan = self._plan(timeline, stored)
    assert (plan.added, plan.updated, plan.unchanged, plan.removed, plan.upserts) == (0, 0, 4, [], [])

  def test_edited_segment_is_updated(self) -> None:
    timeline = self._timeline(1)
    stored = {s.key: _stored(s, timeline.range_end) for s in timeline.segments}
    edited = timeline.segments[0]
    stored[edited.key] = _stored(edited, timeline.range_end, content_hash="before")
    plan = self._plan(timeline, stored)
    assert (plan.updated, plan.unchanged, plan.upserts) == (1, 3, [edited])

  def test_deleted_segment_comes_back_from_a_newer_export(self) -> None:
    timeline = self._timeline(1)
    gone = timeline.segments[0]
    stored = {gone.key: _stored(gone, timeline.range_end - timedelta(days=1), deleted=True)}
    assert self._plan(timeline, stored).added == 4

  def test_newer_knowledge_wins(self) -> None:
    timeline = self._timeline(1)
    later = timeline.range_end + timedelta(days=30)
    edited, tombstoned = timeline.segments[0], timeline.segments[1]
    stored = {
      edited.key: _stored(edited, later, content_hash="newer"),
      tombstoned.key: _stored(tombstoned, later, deleted=True),
    }
    plan = self._plan(timeline, stored)
    assert plan.stale == 2
    assert {s.key for s in plan.upserts}.isdisjoint({edited.key, tombstoned.key})

  def test_missing_segment_inside_span_is_removed(self) -> None:
    old = self._timeline(1, 2, 3)
    stored = {s.key: _stored(s, old.range_end) for s in old.segments}
    new = parse_timeline(_bytes(_export(1, 3)))
    plan = self._plan(new, stored)
    assert len(plan.removed) == 4
    assert plan.unchanged == 8

  def test_segments_outside_span_are_kept(self) -> None:
    old = self._timeline(1, 2)
    stored = {s.key: _stored(s, old.range_end) for s in old.segments}
    plan = self._plan(self._timeline(3), stored)
    assert plan.removed == []

  def test_segment_crossing_span_edge_is_kept(self) -> None:
    timeline = self._timeline(2)
    crossing = parse_timeline(_bytes([_visit("2026-09-01T22:00:00.000+02:00", "2026-09-02T00:30:00.000+02:00", place="late")])).segments[0]
    plan = self._plan(timeline, {crossing.key: _stored(crossing, timeline.range_start)})
    assert plan.removed == []

  def test_older_export_never_removes_what_a_newer_one_confirmed(self) -> None:
    old = self._timeline(1)
    newer_as_of = old.range_end + timedelta(days=5)
    stored = {s.key: _stored(s, newer_as_of) for s in old.segments}
    extra = parse_timeline(_bytes([_visit("2026-09-01T18:00:00.000+02:00", "2026-09-01T19:00:00.000+02:00", place="bar")])).segments[0]
    stored[extra.key] = _stored(extra, newer_as_of)
    assert self._plan(old, stored).removed == []

  def test_removes_nothing_when_told_not_to(self) -> None:
    old = self._timeline(1, 2, 3)
    stored = {s.key: _stored(s, old.range_end) for s in old.segments}
    new = self._timeline(1, 3)
    plan = plan_merge(new.segments, stored, new.range_end, new.range_start, new.range_end, remove_missing=False)
    assert (plan.removed, plan.unchanged) == ([], 8)


class TestImport:
  @pytest.mark.asyncio
  async def test_reimporting_the_same_file_changes_nothing(self, client: AsyncClient, session: AsyncSession) -> None:
    first = await _import(client, _export(1, 2))
    assert _counts(first) == (8, 0, 0, 0, 0)
    assert first["segments"] == 8 and first["format"] == "ios" and first["filename"] == "Timeline.json"
    second = await _import(client, _export(1, 2))
    assert _counts(second) == (0, 0, 0, 8, 0)
    rows = (await session.execute(select(LocationSegment))).scalars().all()
    assert len(rows) == 8

  @pytest.mark.asyncio
  async def test_edit_on_the_phone_updates_the_segment(self, client: AsyncClient) -> None:
    await _import(client, _export(1))
    edited = _export(1)
    edited[2]["visit"]["topCandidate"]["placeID"] = "cafe-id"
    assert _counts(await _import(client, edited)) == (0, 1, 0, 3, 0)
    day = await _day_view(client, "2026-09-01")
    assert [v["place_id"] for v in day["visits"]] == ["home-id", "cafe-id"]

  @pytest.mark.asyncio
  async def test_retimed_visit_replaces_the_old_one(self, client: AsyncClient) -> None:
    await _import(client, _export(1))
    edited = _export(1)
    edited[2]["endTime"] = "2026-09-01T18:00:00.000+02:00"
    assert _counts(await _import(client, edited)) == (1, 0, 1, 3, 0)
    day = await _day_view(client, "2026-09-01")
    assert [v["end_at"] for v in day["visits"]][-1].startswith("2026-09-01T16:00:00")

  @pytest.mark.asyncio
  async def test_deleted_day_is_removed(self, client: AsyncClient) -> None:
    await _import(client, _export(1, 2, 3))
    assert _counts(await _import(client, _export(1, 3))) == (0, 0, 4, 8, 0)
    assert (await _day_view(client, "2026-09-02"))["visits"] == []

  @pytest.mark.asyncio
  async def test_shorter_newer_export_keeps_older_history(self, client: AsyncClient) -> None:
    await _import(client, _export(1, 2, 3))
    assert _counts(await _import(client, _export(3, 4))) == (4, 0, 0, 4, 0)
    assert len((await _day_view(client, "2026-09-01"))["visits"]) == 2

  @pytest.mark.asyncio
  async def test_old_backup_neither_reverts_nor_resurrects(self, client: AsyncClient) -> None:
    await _import(client, _export(1, 2, 3))
    edited = _export(1, 3, 4)
    edited[0]["visit"]["topCandidate"]["placeID"] = "renamed-home"
    await _import(client, edited)

    backup = await _import(client, _export(1, 2, 3))
    assert _counts(backup) == (0, 0, 0, 0, 12)
    assert (await _day_view(client, "2026-09-02"))["visits"] == []
    assert (await _day_view(client, "2026-09-01"))["visits"][0]["place_id"] == "renamed-home"

  @pytest.mark.asyncio
  async def test_fresh_export_removes_its_latest_segments(self, client: AsyncClient) -> None:
    await _import(client, _export(1, 2), exported_at="2026-09-02T20:00:00Z")
    # The last visit of the 2nd deleted on the phone: the file now ends earlier.
    trimmed = _export(1, 2)[:-2] + [_export(2)[-1]]
    result = await _import(client, trimmed, exported_at="2026-09-03T08:00:00Z")
    assert _counts(result) == (0, 0, 1, 7, 0)
    assert [v["place_id"] for v in (await _day_view(client, "2026-09-02"))["visits"]] == ["home-id"]

  @pytest.mark.asyncio
  async def test_old_file_with_old_export_time_changes_nothing(self, client: AsyncClient) -> None:
    await _import(client, _export(1, 2), exported_at="2026-09-03T08:00:00Z")
    edited = _export(1)
    edited[0]["visit"]["topCandidate"]["placeID"] = "old-guess"
    assert _counts(await _import(client, edited, exported_at="2026-09-01T18:00:00Z")) == (0, 0, 0, 0, 4)
    assert (await _day_view(client, "2026-09-01"))["visits"][0]["place_id"] == "home-id"

  @pytest.mark.asyncio
  async def test_old_backup_copied_recently_hides_nothing(self, client: AsyncClient) -> None:
    """A download or AirDrop resets the file's modified time, which the browser sends as its export time."""
    await _import(client, _export(1, 2, 3), exported_at="2026-09-03T20:00:00Z")
    backup = await _import(client, _export(1), exported_at="2026-10-01T09:00:00Z")
    assert _counts(backup) == (0, 0, 0, 0, 4)
    assert backup["as_of"].startswith("2026-09-01T15:00:00")
    assert len((await _day_view(client, "2026-09-03"))["visits"]) == 2

  @pytest.mark.asyncio
  async def test_unreadable_segment_removes_nothing(self, client: AsyncClient) -> None:
    await _import(client, _export(1, 2, 3))
    garbled = {"startTime": "2026-09-02 10:00", "endTime": "2026-09-02T11:00:00.000+02:00", "visit": {}}
    result = await _import(client, [*_export(1, 3), garbled])
    assert (_counts(result), result["unreadable"]) == ((0, 0, 0, 8, 0), 1)
    assert len((await _day_view(client, "2026-09-02"))["visits"]) == 2

  @pytest.mark.asyncio
  async def test_keeps_the_uploaded_file(self, client: AsyncClient, session: AsyncSession) -> None:
    await _import(client, _export(1))
    record = (await session.execute(select(LocationImport))).scalar_one()
    assert record.archive_key is not None
    archived = await file_storage().get(record.archive_key)
    assert archived is not None and gzip.decompress(archived) == _bytes(_export(1))

  @pytest.mark.asyncio
  async def test_refuses_to_import_without_somewhere_to_keep_the_file(self, client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ENV", Environment.production)
    await _import(client, _export(1), status=503)

  @pytest.mark.asyncio
  async def test_export_time_in_the_future_is_capped(self, client: AsyncClient) -> None:
    result = await _import(client, _export(1), exported_at="2999-01-01T00:00:00Z")
    assert result["as_of"] < "2999"

  @pytest.mark.asyncio
  async def test_deleted_then_restored_segment_comes_back(self, client: AsyncClient) -> None:
    await _import(client, _export(1, 2, 3))
    await _import(client, _export(1, 3))
    assert _counts(await _import(client, _export(1, 2, 3, 4))) == (8, 0, 0, 8, 0)
    assert len((await _day_view(client, "2026-09-02"))["visits"]) == 2

  @pytest.mark.asyncio
  async def test_empty_export_changes_nothing(self, client: AsyncClient) -> None:
    await _import(client, _export(1))
    resp = await client.post("/v1/location-history/import", files={"file": ("Timeline.json", b"[]", "application/json")})
    assert resp.status_code == 422
    assert len((await _day_view(client, "2026-09-01"))["visits"]) == 2

  @pytest.mark.asyncio
  async def test_rejects_non_timeline_files(self, client: AsyncClient) -> None:
    resp = await client.post("/v1/location-history/import", files={"file": ("x.json", b'{"timelineObjects": []}', "application/json")})
    assert resp.status_code == 422
    assert "Takeout" in resp.json()["detail"]


class TestDay:
  @pytest.mark.asyncio
  async def test_day_follows_the_local_time_where_it_happened(self, client: AsyncClient) -> None:
    # 23:30–02:00 in Ho Chi Minh City (+07): 16:30–19:00 UTC on the 1st.
    await _import(
      client,
      [
        _visit("2026-09-01T23:30:00.000+07:00", "2026-09-02T02:00:00.000+07:00", place="night"),
        _visit("2026-09-02T09:00:00.000+07:00", "2026-09-02T10:00:00.000+07:00", place="morning"),
      ],
    )
    first, second = await _day_view(client, "2026-09-01"), await _day_view(client, "2026-09-02")
    assert [v["place_id"] for v in first["visits"]] == ["night"]
    assert [v["place_id"] for v in second["visits"]] == ["night", "morning"]
    assert first["visits"][0]["utc_offset_minutes"] == 420

  @pytest.mark.asyncio
  async def test_trip_across_time_zones_ends_on_its_own_local_day(self, client: AsyncClient) -> None:
    # Tokyo 23:00 on the 1st to San Francisco 22:00 on the 1st: 14:00 to 05:00 UTC.
    await _import(client, [_trip("2026-09-01T23:00:00.000+09:00", "2026-09-01T22:00:00.000-07:00", kind="flying")])
    summary = (await client.get("/v1/location-history/summary")).json()
    assert summary["days"] == ["2026-09-01"]
    (flight,) = (await _day_view(client, "2026-09-01"))["activities"]
    assert (flight["utc_offset_minutes"], flight["end_utc_offset_minutes"]) == (540, -420)

  @pytest.mark.asyncio
  async def test_returns_trips_and_route_points(self, client: AsyncClient) -> None:
    await _import(client, _export(1, 2))
    day = await _day_view(client, "2026-09-01")
    assert [a["activity_type"] for a in day["activities"]] == ["walking"]
    assert day["activities"][0]["distance_meters"] == 812.5
    assert [(p["latitude"], p["ts"] - int(datetime(2026, 9, 1, 6, tzinfo=UTC).timestamp())) for p in day["path"]] == [(59.334591, 60), (59.329323, 1200)]
    assert all(v["name"] is None for v in day["visits"])

  @pytest.mark.asyncio
  async def test_a_trip_logged_as_starting_the_evening_before_brings_the_place_it_left(self, client: AsyncClient) -> None:
    await _import(
      client,
      [
        _visit(f"2026-09-01T19:00:00.000{STOCKHOLM}", f"2026-09-01T20:15:00.000{STOCKHOLM}", place="earlier-id"),
        _visit(f"2026-09-01T17:00:00.000{STOCKHOLM}", f"2026-09-01T20:22:00.000{STOCKHOLM}", place="home-id"),
        _visit(f"2026-09-01T18:00:00.000{STOCKHOLM}", f"2026-09-01T20:24:00.000{STOCKHOLM}", place="area-id", level="1"),
        _path("2026-09-01T18:24:00.000Z", "2026-09-01T18:24:00.000Z", [(OFFICE, 0)]),
        _trip(f"2026-09-01T20:24:00.000{STOCKHOLM}", f"2026-09-02T14:33:00.000{STOCKHOLM}", kind="in passenger vehicle"),
        _visit(f"2026-09-02T14:35:00.000{STOCKHOLM}", f"2026-09-02T17:00:00.000{STOCKHOLM}", place="museum-id", location=OFFICE),
      ],
    )
    day = await _day_view(client, "2026-09-02")
    assert [v["place_id"] for v in day["visits"]] == ["museum-id"]
    assert day["departed_from"]["place_id"] == "home-id"
    assert (day["departed_from"]["latitude"], day["departed_from"]["longitude"]) == (59.334591, 18.06324)

  @pytest.mark.asyncio
  async def test_no_place_left_when_the_first_trip_starts_that_day_or_none_ended_then(self, client: AsyncClient) -> None:
    await _import(
      client,
      [
        *_export(1),
        _visit(f"2026-09-03T18:00:00.000{STOCKHOLM}", f"2026-09-03T19:00:00.000{STOCKHOLM}", place="long-before-id"),
        _trip(f"2026-09-03T21:00:00.000{STOCKHOLM}", f"2026-09-04T09:00:00.000{STOCKHOLM}"),
      ],
    )
    assert (await _day_view(client, "2026-09-01"))["departed_from"] is None
    assert (await _day_view(client, "2026-09-04"))["departed_from"] is None

  @pytest.mark.asyncio
  async def test_names_places_when_lookups_are_configured(self, client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    await _import(client, _export(1))
    monkeypatch.setattr(place_names.settings, "GOOGLE_PLACES_API_KEY", "key")
    looked_up: list[str] = []

    async def fake_fetch(_client: Any, place_id: str) -> place_names.PlaceName | None:
      looked_up.append(place_id)
      return place_names.PlaceName(name=f"Name of {place_id}", address="Somewhere 1")

    monkeypatch.setattr(place_names, "_fetch", fake_fetch)
    day = await _day_view(client, "2026-09-01")
    assert [(v["name"], v["address"]) for v in day["visits"]] == [("Name of home-id", "Somewhere 1"), ("Name of office-id", "Somewhere 1")]
    await _day_view(client, "2026-09-01")
    assert sorted(looked_up) == ["home-id", "office-id"]


class TestSummary:
  @pytest.mark.asyncio
  async def test_empty(self, client: AsyncClient) -> None:
    resp = await client.get("/v1/location-history/summary")
    assert resp.status_code == 200
    assert resp.json() == {"days": [], "last_import": None, "place_names": False}

  @pytest.mark.asyncio
  async def test_lists_days_and_last_import(self, client: AsyncClient) -> None:
    await _import(client, _export(1, 3) + [_visit("2026-09-05T22:00:00.000+02:00", "2026-09-07T00:00:00.000+02:00", place="trip")])
    summary = (await client.get("/v1/location-history/summary")).json()
    assert summary["days"] == ["2026-09-01", "2026-09-03", "2026-09-05", "2026-09-06"]
    assert summary["last_import"]["added"] == 9

  @pytest.mark.asyncio
  async def test_lists_a_day_with_only_a_route(self, client: AsyncClient) -> None:
    await _import(client, [*_export(1), _path("2026-09-04T06:00:00.000Z", "2026-09-04T08:00:00.000Z", [(HOME, 1)])])
    summary = (await client.get("/v1/location-history/summary")).json()
    assert summary["days"] == ["2026-09-01", "2026-09-04"]
