from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest
from api.models.activity_event import ActivityEvent
from api.tests.fixtures.database import SaveFixture
from httpx import AsyncClient

DAY_START = int(datetime(2026, 7, 2, tzinfo=UTC).timestamp())
DAY_END = DAY_START + 86400
SOURCE = "test-machine"


def _ts(hour: int, minute: int = 0) -> int:
  return DAY_START + hour * 3600 + minute * 60


def _ev(local_id: int, ts: int, state: str = "active", app_class: str | None = "kitty", source: str = SOURCE) -> ActivityEvent:
  return ActivityEvent(local_id=local_id, ts=ts, state=state, app_class=app_class, title=None, workspace=None, source=source)


def _sleep(start_ts: int, end_ts: int, stage: str = "asleepCore", source_name: str = "Apple Watch") -> dict[str, Any]:
  return {
    "healthkit_uuid": str(uuid4()),
    "sleep_value": 3,
    "sleep_value_name": stage,
    "start_date": datetime.fromtimestamp(start_ts, tz=UTC).isoformat(),
    "end_date": datetime.fromtimestamp(end_ts, tz=UTC).isoformat(),
    "source_name": source_name,
    "source_bundle_id": "com.apple.health",
    "source_version": "11.0",
    "device_name": source_name,
    "sample_metadata": None,
  }


async def _sync_sleep(client: AsyncClient, samples: list[dict[str, Any]]) -> None:
  resp = await client.post("/v1/healthkit/sleep/sync", json={"samples": samples, "deleted_uuids": []})
  assert resp.status_code == 200


async def _timeline(client: AsyncClient, **params: Any) -> dict[str, Any]:
  resp = await client.get("/v1/timeline", params={"start_ts": DAY_START, "end_ts": DAY_END, **params})
  assert resp.status_code == 200
  return resp.json()


def _lane(data: dict[str, Any], key: str) -> dict[str, Any]:
  return next(lane for lane in data["lanes"] if lane["key"] == key)


class TestTimeline:
  @pytest.mark.asyncio
  async def test_empty_day(self, client: AsyncClient) -> None:
    data = await _timeline(client)
    assert data["source"] is None
    assert data["tracked_secs"] == 0
    assert [lane["key"] for lane in data["lanes"]] == ["sleep", "pc"]
    assert all(lane["segments"] == [] and lane["total_secs"] == 0 for lane in data["lanes"])

  @pytest.mark.asyncio
  async def test_sleep_spanning_window_start_is_clipped(self, client: AsyncClient) -> None:
    await _sync_sleep(client, [_sleep(DAY_START - 3600, _ts(7))])

    sleep = _lane(await _timeline(client), "sleep")
    assert sleep["segments"] == [{"start_ts": DAY_START, "end_ts": _ts(7), "label": "asleepCore"}]
    assert sleep["total_secs"] == 7 * 3600

  @pytest.mark.asyncio
  async def test_awake_shown_but_not_counted(self, client: AsyncClient) -> None:
    await _sync_sleep(client, [_sleep(_ts(1), _ts(3)), _sleep(_ts(3), _ts(3, 30), stage="awake"), _sleep(_ts(3, 30), _ts(6), stage="asleepDeep")])

    sleep = _lane(await _timeline(client), "sleep")
    assert [s["label"] for s in sleep["segments"]] == ["asleepCore", "awake", "asleepDeep"]
    assert sleep["total_secs"] == 2 * 3600 + 2.5 * 3600

  @pytest.mark.asyncio
  async def test_overlapping_sleep_sources_counted_once(self, client: AsyncClient) -> None:
    await _sync_sleep(client, [_sleep(_ts(0), _ts(6)), _sleep(_ts(2), _ts(8), source_name="iPhone")])

    data = await _timeline(client)
    assert _lane(data, "sleep")["total_secs"] == 8 * 3600
    assert data["tracked_secs"] == 8 * 3600

  @pytest.mark.asyncio
  async def test_contiguous_same_app_segments_merge(self, client: AsyncClient, save_fixture: SaveFixture) -> None:
    await save_fixture(_ev(1, _ts(9)))
    await save_fixture(_ev(2, _ts(9, 5)))
    await save_fixture(_ev(3, _ts(9, 10), app_class="firefox"))
    await save_fixture(_ev(4, _ts(9, 15), state="idle"))

    data = await _timeline(client)
    assert data["source"] == SOURCE
    pc = _lane(data, "pc")
    assert pc["segments"] == [
      {"start_ts": _ts(9), "end_ts": _ts(9, 10), "label": "kitty"},
      {"start_ts": _ts(9, 10), "end_ts": _ts(9, 15), "label": "firefox"},
    ]
    assert pc["total_secs"] == 15 * 60

  @pytest.mark.asyncio
  async def test_explicit_source(self, client: AsyncClient, save_fixture: SaveFixture) -> None:
    await save_fixture(_ev(1, _ts(9), source="laptop"))
    await save_fixture(_ev(2, _ts(9, 5), state="idle", source="laptop"))
    await save_fixture(_ev(3, _ts(10)))
    await save_fixture(_ev(4, _ts(10, 5), state="idle"))

    data = await _timeline(client, source="laptop")
    assert data["source"] == "laptop"
    assert _lane(data, "pc")["segments"][0]["start_ts"] == _ts(9)

  @pytest.mark.asyncio
  async def test_tracked_secs_unions_lanes(self, client: AsyncClient, save_fixture: SaveFixture) -> None:
    await _sync_sleep(client, [_sleep(_ts(0), _ts(1))])
    await save_fixture(_ev(1, _ts(0, 55)))
    await save_fixture(_ev(2, _ts(1, 5), state="idle"))

    data = await _timeline(client)
    assert data["tracked_secs"] == 3600 + 5 * 60

  @pytest.mark.asyncio
  @pytest.mark.parametrize("end_offset", [0, -60, 8 * 86400])
  async def test_invalid_window_rejected(self, client: AsyncClient, end_offset: int) -> None:
    resp = await client.get("/v1/timeline", params={"start_ts": DAY_START, "end_ts": DAY_START + end_offset})
    assert resp.status_code == 422
