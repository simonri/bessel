from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient


async def _exercise(client: AsyncClient, name: str = "Bench press", exercise_id: str | None = None) -> str:
  exercise_id = exercise_id or str(uuid4())
  resp = await client.put(f"/v1/gym/exercises/{exercise_id}", json={"name": name})
  assert resp.status_code == 200, resp.text
  return exercise_id


async def _set(client: AsyncClient, exercise_id: str, day: str, weight: float) -> Any:
  return await client.put(f"/v1/gym/exercises/{exercise_id}/sets/{day}", json={"weight_kg": weight})


async def _list(client: AsyncClient) -> list[dict[str, Any]]:
  resp = await client.get("/v1/gym/exercises")
  assert resp.status_code == 200
  return resp.json()["exercises"]


class TestExercises:
  @pytest.mark.asyncio
  async def test_creating_twice_with_the_same_id_is_one_exercise(self, client: AsyncClient) -> None:
    exercise_id = str(uuid4())
    await _exercise(client, "Squat", exercise_id)
    await _exercise(client, "Squat", exercise_id)

    assert [(e["id"], e["name"]) for e in await _list(client)] == [(exercise_id, "Squat")]

  @pytest.mark.asyncio
  async def test_renames_and_tidies_names(self, client: AsyncClient) -> None:
    exercise_id = await _exercise(client, "Squat")
    await _exercise(client, "  Back   squat ", exercise_id)

    assert [e["name"] for e in await _list(client)] == ["Back squat"]

  @pytest.mark.asyncio
  async def test_names_are_unique_ignoring_case(self, client: AsyncClient) -> None:
    await _exercise(client, "Deadlift")

    resp = await client.put(f"/v1/gym/exercises/{uuid4()}", json={"name": "deadlift"})

    assert resp.status_code == 409
    assert resp.json()["detail"] == "You already have an exercise called Deadlift."

  @pytest.mark.asyncio
  async def test_a_deleted_name_can_be_used_again(self, client: AsyncClient) -> None:
    exercise_id = await _exercise(client, "Deadlift")
    assert (await client.delete(f"/v1/gym/exercises/{exercise_id}")).status_code == 204

    await _exercise(client, "Deadlift")

    assert [e["name"] for e in await _list(client)] == ["Deadlift"]

  @pytest.mark.asyncio
  async def test_empty_names_are_rejected(self, client: AsyncClient) -> None:
    resp = await client.put(f"/v1/gym/exercises/{uuid4()}", json={"name": "   "})
    assert resp.status_code == 422

  @pytest.mark.asyncio
  async def test_most_recently_trained_first(self, client: AsyncClient) -> None:
    squat = await _exercise(client, "Squat")
    bench = await _exercise(client, "Bench press")
    await _exercise(client, "Pull ups")
    await _set(client, squat, "2026-10-01", 80)
    await _set(client, bench, "2026-10-05", 60)

    names = [e["name"] for e in await _list(client)]

    # New exercises count from today, ahead of ones last trained days ago.
    assert names == ["Pull ups", "Bench press", "Squat"]


class TestTopSets:
  @pytest.mark.asyncio
  async def test_one_top_set_a_day_replaced_on_resend(self, client: AsyncClient) -> None:
    exercise_id = await _exercise(client)
    await _set(client, exercise_id, "2026-10-08", 60)
    resp = await _set(client, exercise_id, "2026-10-08", 62.5)

    assert resp.json() == {"performed_on": "2026-10-08", "weight_kg": 62.5}
    sets = (await client.get(f"/v1/gym/exercises/{exercise_id}/sets")).json()["sets"]
    assert sets == [{"performed_on": "2026-10-08", "weight_kg": 62.5}]

  @pytest.mark.asyncio
  async def test_summary_has_last_best_and_recent(self, client: AsyncClient) -> None:
    exercise_id = await _exercise(client)
    for day, weight in [("2026-09-01", 55), ("2026-09-08", 65), ("2026-09-15", 60), ("2026-09-22", 65)]:
      await _set(client, exercise_id, day, weight)

    [summary] = await _list(client)

    assert summary["last_set"] == {"performed_on": "2026-09-22", "weight_kg": 65}
    assert summary["best_set"] == {"performed_on": "2026-09-22", "weight_kg": 65}
    assert [s["weight_kg"] for s in summary["recent_sets"]] == [55, 65, 60, 65]

  @pytest.mark.asyncio
  async def test_recent_sets_are_the_last_ten(self, client: AsyncClient) -> None:
    exercise_id = await _exercise(client)
    for day in range(1, 13):
      await _set(client, exercise_id, f"2026-09-{day:02d}", 40 + day)

    [summary] = await _list(client)

    assert [s["performed_on"] for s in summary["recent_sets"]] == [f"2026-09-{day:02d}" for day in range(3, 13)]
    assert summary["best_set"]["weight_kg"] == 52

  @pytest.mark.asyncio
  async def test_bodyweight_and_half_kilos(self, client: AsyncClient) -> None:
    exercise_id = await _exercise(client, "Dips")
    assert (await _set(client, exercise_id, "2026-10-01", 0)).json()["weight_kg"] == 0
    assert (await _set(client, exercise_id, "2026-10-02", 1.25)).json()["weight_kg"] == 1.25
    assert (await _set(client, exercise_id, "2026-10-03", -5)).status_code == 422

  @pytest.mark.asyncio
  async def test_deleting_a_set(self, client: AsyncClient) -> None:
    exercise_id = await _exercise(client)
    await _set(client, exercise_id, "2026-10-08", 60)

    assert (await client.delete(f"/v1/gym/exercises/{exercise_id}/sets/2026-10-08")).status_code == 204
    assert (await client.delete(f"/v1/gym/exercises/{exercise_id}/sets/2026-10-08")).status_code == 404
    assert (await _list(client))[0]["last_set"] is None

  @pytest.mark.asyncio
  async def test_deleting_an_exercise_takes_its_sets(self, client: AsyncClient) -> None:
    exercise_id = await _exercise(client)
    await _set(client, exercise_id, "2026-10-08", 60)

    assert (await client.delete(f"/v1/gym/exercises/{exercise_id}")).status_code == 204
    assert (await client.get(f"/v1/gym/exercises/{exercise_id}/sets")).status_code == 404
    assert (await _set(client, exercise_id, "2026-10-09", 60)).status_code == 404
    assert await _list(client) == []
