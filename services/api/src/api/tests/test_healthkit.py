from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import pytest
from api.models.healthkit_workout import HealthKitWorkout
from api.models.user import User
from api.tests.fixtures.database import SaveFixture
from httpx import AsyncClient

BASE_DATE = datetime(2026, 7, 1, 8, 0, tzinfo=UTC)


def _workout(healthkit_uuid: str | None = None, *, start_offset_hours: int = 0, **overrides: Any) -> dict[str, Any]:
  start = BASE_DATE + timedelta(hours=start_offset_hours)
  payload: dict[str, Any] = {
    "healthkit_uuid": healthkit_uuid or str(uuid4()),
    "workout_activity_type": 37,
    "workout_activity_type_name": "running",
    "start_date": start.isoformat(),
    "end_date": (start + timedelta(minutes=30)).isoformat(),
    "duration": 1800.0,
    "total_energy_burned": 350.0,
    "total_distance": 5000.0,
    "source_name": "Apple Watch",
    "source_bundle_id": "com.apple.health",
    "source_version": "11.0",
    "device_name": "Apple Watch",
    "workout_metadata": {"HKIndoorWorkout": False},
    "statistics": {"HKQuantityTypeIdentifierHeartRate": {"average": 141.2, "min": 98.0, "max": 172.0, "unit": "count/min"}},
  }
  payload.update(overrides)
  return payload


async def _sync(client: AsyncClient, workouts: list[dict[str, Any]], deleted_uuids: list[str] | None = None) -> dict[str, Any]:
  resp = await client.post("/v1/healthkit/workouts/sync", json={"workouts": workouts, "deleted_uuids": deleted_uuids or []})
  assert resp.status_code == 200
  return resp.json()


async def _list_items(client: AsyncClient, **params: Any) -> list[dict[str, Any]]:
  resp = await client.get("/v1/healthkit/workouts", params=params)
  assert resp.status_code == 200
  return resp.json()["items"]


class TestSyncWorkouts:
  @pytest.mark.asyncio
  async def test_empty_request(self, client: AsyncClient) -> None:
    data = await _sync(client, [])
    assert data == {"synced": 0, "deleted": 0}

  @pytest.mark.asyncio
  async def test_insert_new_workouts(self, client: AsyncClient) -> None:
    data = await _sync(client, [_workout(), _workout(start_offset_hours=1)])
    assert data["synced"] == 2

    items = await _list_items(client)
    assert len(items) == 2
    assert items[0]["workout_activity_type_name"] == "running"
    assert items[0]["statistics"]["HKQuantityTypeIdentifierHeartRate"]["average"] == 141.2

  @pytest.mark.asyncio
  async def test_reupload_updates_instead_of_duplicating(self, client: AsyncClient) -> None:
    hk_uuid = str(uuid4())
    await _sync(client, [_workout(hk_uuid)])
    data = await _sync(client, [_workout(hk_uuid, total_energy_burned=420.0)])
    assert data["synced"] == 1

    items = await _list_items(client)
    assert len(items) == 1
    assert items[0]["total_energy_burned"] == 420.0

  @pytest.mark.asyncio
  async def test_in_request_duplicates_last_wins(self, client: AsyncClient) -> None:
    hk_uuid = str(uuid4())
    data = await _sync(client, [_workout(hk_uuid, total_energy_burned=100.0), _workout(hk_uuid, total_energy_burned=200.0)])
    assert data["synced"] == 1

    items = await _list_items(client)
    assert items[0]["total_energy_burned"] == 200.0

  @pytest.mark.asyncio
  async def test_delete_workouts(self, client: AsyncClient) -> None:
    hk_uuid = str(uuid4())
    await _sync(client, [_workout(hk_uuid), _workout()])

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
    await _sync(client, [_workout(hk_uuid)])
    await _sync(client, [], deleted_uuids=[hk_uuid])
    assert await _list_items(client) == []

    data = await _sync(client, [_workout(hk_uuid)])
    assert data["synced"] == 1
    assert len(await _list_items(client)) == 1

  @pytest.mark.asyncio
  async def test_batch_over_limit_rejected(self, client: AsyncClient) -> None:
    resp = await client.post(
      "/v1/healthkit/workouts/sync",
      json={"workouts": [_workout() for _ in range(501)], "deleted_uuids": []},
    )
    assert resp.status_code == 422


class TestListWorkouts:
  @pytest.mark.asyncio
  async def test_ordered_by_start_date_desc(self, client: AsyncClient) -> None:
    await _sync(client, [_workout(start_offset_hours=0), _workout(start_offset_hours=2), _workout(start_offset_hours=1)])
    items = await _list_items(client)
    start_dates = [item["start_date"] for item in items]
    assert start_dates == sorted(start_dates, reverse=True)

  @pytest.mark.asyncio
  async def test_pagination(self, client: AsyncClient) -> None:
    await _sync(client, [_workout(start_offset_hours=i) for i in range(3)])

    resp = await client.get("/v1/healthkit/workouts", params={"limit": 2, "page": 1})
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
      HealthKitWorkout(
        user_id=other_user.id,
        healthkit_uuid=uuid4(),
        workout_activity_type=37,
        workout_activity_type_name="running",
        start_date=BASE_DATE,
        end_date=BASE_DATE + timedelta(minutes=30),
        duration=1800.0,
        source_name="Apple Watch",
        source_bundle_id="com.apple.health",
      )
    )

    assert await _list_items(client) == []
