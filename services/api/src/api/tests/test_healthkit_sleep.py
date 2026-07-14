from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import pytest
from api.models.healthkit_sleep_sample import HealthKitSleepSample
from api.models.user import User
from api.tests.fixtures.database import SaveFixture
from httpx import AsyncClient

BASE_DATE = datetime(2026, 7, 1, 23, 0, tzinfo=UTC)


def _sample(healthkit_uuid: str | None = None, *, start_offset_hours: float = 0, duration_mins: float = 30, **overrides: Any) -> dict[str, Any]:
  start = BASE_DATE + timedelta(hours=start_offset_hours)
  return _sample_at(start, start + timedelta(minutes=duration_mins), healthkit_uuid=healthkit_uuid, **overrides)


def _sample_at(start: datetime, end: datetime, *, healthkit_uuid: str | None = None, **overrides: Any) -> dict[str, Any]:
  payload: dict[str, Any] = {
    "healthkit_uuid": healthkit_uuid or str(uuid4()),
    "sleep_value": 3,
    "sleep_value_name": "asleepCore",
    "start_date": start.isoformat(),
    "end_date": end.isoformat(),
    "source_name": "Apple Watch",
    "source_bundle_id": "com.apple.health",
    "source_version": "11.0",
    "device_name": "Apple Watch",
    "sample_metadata": {"HKWasUserEntered": False},
  }
  payload.update(overrides)
  return payload


async def _sync(client: AsyncClient, samples: list[dict[str, Any]], deleted_uuids: list[str] | None = None) -> dict[str, Any]:
  resp = await client.post("/v1/healthkit/sleep/sync", json={"samples": samples, "deleted_uuids": deleted_uuids or []})
  assert resp.status_code == 200
  return resp.json()


async def _list_items(client: AsyncClient, **params: Any) -> list[dict[str, Any]]:
  resp = await client.get("/v1/healthkit/sleep", params=params)
  assert resp.status_code == 200
  return resp.json()["items"]


class TestSyncSleep:
  @pytest.mark.asyncio
  async def test_empty_request(self, client: AsyncClient) -> None:
    data = await _sync(client, [])
    assert data == {"synced": 0, "deleted": 0}

  @pytest.mark.asyncio
  async def test_insert_new_samples(self, client: AsyncClient) -> None:
    data = await _sync(client, [_sample(), _sample(start_offset_hours=1)])
    assert data["synced"] == 2

    items = await _list_items(client)
    assert len(items) == 2
    assert items[0]["sleep_value_name"] == "asleepCore"
    assert items[0]["sample_metadata"]["HKWasUserEntered"] is False

  @pytest.mark.asyncio
  async def test_reupload_updates_instead_of_duplicating(self, client: AsyncClient) -> None:
    hk_uuid = str(uuid4())
    await _sync(client, [_sample(hk_uuid)])
    data = await _sync(client, [_sample(hk_uuid, sleep_value_name="asleepDeep", sleep_value=4)])
    assert data["synced"] == 1

    items = await _list_items(client)
    assert len(items) == 1
    assert items[0]["sleep_value_name"] == "asleepDeep"

  @pytest.mark.asyncio
  async def test_in_request_duplicates_last_wins(self, client: AsyncClient) -> None:
    hk_uuid = str(uuid4())
    data = await _sync(client, [_sample(hk_uuid, sleep_value_name="awake"), _sample(hk_uuid, sleep_value_name="asleepREM")])
    assert data["synced"] == 1

    items = await _list_items(client)
    assert items[0]["sleep_value_name"] == "asleepREM"

  @pytest.mark.asyncio
  async def test_delete_samples(self, client: AsyncClient) -> None:
    hk_uuid = str(uuid4())
    await _sync(client, [_sample(hk_uuid), _sample()])

    data = await _sync(client, [], deleted_uuids=[hk_uuid])
    assert data == {"synced": 0, "deleted": 1}
    assert len(await _list_items(client)) == 1

  @pytest.mark.asyncio
  async def test_delete_unknown_uuid_is_noop(self, client: AsyncClient) -> None:
    data = await _sync(client, [], deleted_uuids=[str(uuid4())])
    assert data == {"synced": 0, "deleted": 0}

  @pytest.mark.asyncio
  async def test_reupload_resurrects_soft_deleted(self, client: AsyncClient) -> None:
    hk_uuid = str(uuid4())
    await _sync(client, [_sample(hk_uuid)])
    await _sync(client, [], deleted_uuids=[hk_uuid])
    assert await _list_items(client) == []

    data = await _sync(client, [_sample(hk_uuid)])
    assert data["synced"] == 1
    assert len(await _list_items(client)) == 1

  @pytest.mark.asyncio
  async def test_batch_over_limit_rejected(self, client: AsyncClient) -> None:
    resp = await client.post(
      "/v1/healthkit/sleep/sync",
      json={"samples": [_sample() for _ in range(501)], "deleted_uuids": []},
    )
    assert resp.status_code == 422


class TestListSleep:
  @pytest.mark.asyncio
  async def test_ordered_by_start_date_desc(self, client: AsyncClient) -> None:
    await _sync(client, [_sample(start_offset_hours=0), _sample(start_offset_hours=2), _sample(start_offset_hours=1)])
    items = await _list_items(client)
    start_dates = [item["start_date"] for item in items]
    assert start_dates == sorted(start_dates, reverse=True)

  @pytest.mark.asyncio
  async def test_pagination(self, client: AsyncClient) -> None:
    await _sync(client, [_sample(start_offset_hours=i) for i in range(3)])

    resp = await client.get("/v1/healthkit/sleep", params={"limit": 2, "page": 1})
    data = resp.json()
    assert len(data["items"]) == 2
    assert data["pagination"]["total_count"] == 3
    assert data["pagination"]["max_page"] == 2

    items = await _list_items(client, limit=2, page=2)
    assert len(items) == 1

  @pytest.mark.asyncio
  async def test_scoped_to_current_user(self, client: AsyncClient, save_fixture: SaveFixture) -> None:
    other_user = User(auth0_sub="auth0|other-user", email="other@example.com")
    await save_fixture(other_user)
    await save_fixture(
      HealthKitSleepSample(
        user_id=other_user.id,
        healthkit_uuid=uuid4(),
        sleep_value=3,
        sleep_value_name="asleepCore",
        start_date=BASE_DATE,
        end_date=BASE_DATE + timedelta(minutes=30),
        source_name="Apple Watch",
        source_bundle_id="com.apple.health",
      )
    )

    assert await _list_items(client) == []


# 2026-07-01 12:00:00 UTC — the noon boundary between the nights of 07-01 and 07-02.
NOON = int(datetime(2026, 7, 1, 12, 0, tzinfo=UTC).timestamp())


class TestDailySleep:
  @pytest.mark.asyncio
  async def test_night_crossing_midnight_buckets_to_wake_date(self, client: AsyncClient) -> None:
    # Asleep 23:00 July 1 -> 07:00 July 2. Entirely inside the noon(1st)-to-noon(2nd)
    # night window, so it should land as one bucket keyed by the wake date (July 2),
    # not split across the two calendar dates it spans in UTC.
    start = datetime(2026, 7, 1, 23, 0, tzinfo=UTC)
    end = datetime(2026, 7, 2, 7, 0, tzinfo=UTC)
    await _sync(client, [_sample_at(start, end)])

    resp = await client.get(
      "/v1/healthkit/sleep/daily",
      params={"start_ts": NOON - 86400, "end_ts": NOON + 86400, "tz_name": "UTC"},
    )
    assert resp.status_code == 200
    nights = {n["date"]: n["asleep_secs"] for n in resp.json()["nights"]}
    assert nights == {"2026-07-02": 8 * 3600}

  @pytest.mark.asyncio
  async def test_segment_straddling_noon_boundary_splits(self, client: AsyncClient) -> None:
    # An 11:30 -> 12:30 segment straddles the noon cutoff itself: 30 min belongs
    # to the night ending at noon on the 1st, 30 min to the one ending on the 2nd.
    start = datetime(2026, 7, 1, 11, 30, tzinfo=UTC)
    end = datetime(2026, 7, 1, 12, 30, tzinfo=UTC)
    await _sync(client, [_sample_at(start, end)])

    resp = await client.get(
      "/v1/healthkit/sleep/daily",
      params={"start_ts": NOON - 86400, "end_ts": NOON + 86400, "tz_name": "UTC"},
    )
    assert resp.status_code == 200
    nights = {n["date"]: n["asleep_secs"] for n in resp.json()["nights"]}
    assert nights == {"2026-07-01": 1800, "2026-07-02": 1800}

  @pytest.mark.asyncio
  async def test_awake_and_in_bed_excluded_from_totals(self, client: AsyncClient) -> None:
    start = datetime(2026, 7, 1, 23, 0, tzinfo=UTC)
    await _sync(
      client,
      [
        _sample_at(start, start + timedelta(minutes=30), sleep_value_name="asleepCore"),
        _sample_at(start + timedelta(minutes=30), start + timedelta(minutes=45), sleep_value_name="awake"),
        _sample_at(start - timedelta(minutes=10), start, sleep_value_name="inBed"),
      ],
    )

    resp = await client.get(
      "/v1/healthkit/sleep/daily",
      params={"start_ts": NOON - 86400, "end_ts": NOON + 86400, "tz_name": "UTC"},
    )
    assert resp.status_code == 200
    nights = {n["date"]: n["asleep_secs"] for n in resp.json()["nights"]}
    assert nights == {"2026-07-02": 1800}


class TestSleepSummary:
  @pytest.mark.asyncio
  async def test_stage_breakdown_percentages(self, client: AsyncClient) -> None:
    start = datetime(2026, 7, 1, 23, 0, tzinfo=UTC)
    await _sync(
      client,
      [
        _sample_at(start, start + timedelta(minutes=45), sleep_value_name="asleepDeep", sleep_value=4),
        _sample_at(start + timedelta(minutes=45), start + timedelta(minutes=60), sleep_value_name="awake", sleep_value=2),
      ],
    )

    resp = await client.get(
      "/v1/healthkit/sleep/summary",
      params={"start_ts": NOON - 86400, "end_ts": NOON + 86400},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_asleep_secs"] == 45 * 60

    stages = {s["stage"]: s["percentage"] for s in data["stages"]}
    assert stages["asleepDeep"] == pytest.approx(75.0)
    assert stages["awake"] == pytest.approx(25.0)

  @pytest.mark.asyncio
  async def test_in_bed_excluded_from_breakdown(self, client: AsyncClient) -> None:
    start = datetime(2026, 7, 1, 23, 0, tzinfo=UTC)
    await _sync(
      client,
      [
        _sample_at(start - timedelta(minutes=10), start, sleep_value_name="inBed", sleep_value=0),
        _sample_at(start, start + timedelta(minutes=30), sleep_value_name="asleepCore"),
      ],
    )

    resp = await client.get(
      "/v1/healthkit/sleep/summary",
      params={"start_ts": NOON - 86400, "end_ts": NOON + 86400},
    )
    assert resp.status_code == 200
    data = resp.json()
    stages = {s["stage"] for s in data["stages"]}
    assert stages == {"asleepCore"}
