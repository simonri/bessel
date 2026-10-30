from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from api.common.utils import utc_now
from httpx import AsyncClient


def _at(value: str) -> datetime:
  return datetime.fromisoformat(value)


class TestBackdatedReset:
  @pytest.mark.asyncio
  async def test_without_a_date_it_happened_now(self, client: AsyncClient) -> None:
    counter = (await client.post("/v1/counters", json={"name": "Gym"})).json()
    before = utc_now()

    reset = (await client.post(f"/v1/counters/{counter['id']}/resets")).json()

    assert before - timedelta(seconds=1) <= _at(reset["occurred_at"]) <= utc_now()

  @pytest.mark.asyncio
  async def test_an_earlier_day_counts_from_that_day(self, client: AsyncClient) -> None:
    counter = (await client.post("/v1/counters", json={"name": "Gym"})).json()
    four_days_ago = utc_now() - timedelta(days=4)

    resp = await client.post(f"/v1/counters/{counter['id']}/resets", json={"occurred_at": four_days_ago.isoformat()})

    assert resp.status_code == 201
    assert _at(resp.json()["occurred_at"]) == four_days_ago
    [listed] = (await client.get("/v1/counters")).json()
    assert _at(listed["last_reset_at"]) == four_days_ago

  @pytest.mark.asyncio
  async def test_an_older_reset_does_not_hide_a_newer_one(self, client: AsyncClient) -> None:
    counter = (await client.post("/v1/counters", json={"name": "Gym"})).json()
    yesterday = utc_now() - timedelta(days=1)
    last_week = utc_now() - timedelta(days=7)
    await client.post(f"/v1/counters/{counter['id']}/resets", json={"occurred_at": yesterday.isoformat()})
    await client.post(f"/v1/counters/{counter['id']}/resets", json={"occurred_at": last_week.isoformat()})

    [listed] = (await client.get("/v1/counters")).json()
    history = (await client.get(f"/v1/counters/{counter['id']}/resets")).json()

    assert _at(listed["last_reset_at"]) == yesterday
    assert listed["reset_count"] == 2
    assert [_at(r["occurred_at"]) for r in history] == [yesterday, last_week]

  @pytest.mark.asyncio
  async def test_the_future_is_refused(self, client: AsyncClient) -> None:
    counter = (await client.post("/v1/counters", json={"name": "Gym"})).json()
    tomorrow = utc_now() + timedelta(days=1)

    resp = await client.post(f"/v1/counters/{counter['id']}/resets", json={"occurred_at": tomorrow.isoformat()})

    assert resp.status_code == 400
    assert (await client.get(f"/v1/counters/{counter['id']}/resets")).json() == []

  @pytest.mark.asyncio
  async def test_a_date_without_a_timezone_is_refused(self, client: AsyncClient) -> None:
    counter = (await client.post("/v1/counters", json={"name": "Gym"})).json()

    resp = await client.post(f"/v1/counters/{counter['id']}/resets", json={"occurred_at": "2026-10-20T12:00:00"})

    assert resp.status_code == 422


class TestCounterNotFound:
  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_undo_missing_reset_returns_404(self, client: AsyncClient) -> None:
    counter = (await client.post("/v1/counters", json={"name": "Days"})).json()

    resp = await client.delete(f"/v1/counters/{counter['id']}/resets/{uuid4()}")
    assert resp.status_code == 404

  @pytest.mark.asyncio
  async def test_undo_reset_of_another_counter_returns_404(self, client: AsyncClient) -> None:
    days = (await client.post("/v1/counters", json={"name": "Days"})).json()
    weeks = (await client.post("/v1/counters", json={"name": "Weeks"})).json()
    reset = (await client.post(f"/v1/counters/{weeks['id']}/resets")).json()

    resp = await client.delete(f"/v1/counters/{days['id']}/resets/{reset['id']}")

    assert resp.status_code == 404
    remaining = (await client.get(f"/v1/counters/{weeks['id']}/resets")).json()
    assert [r["id"] for r in remaining] == [reset["id"]]

  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_undo_already_undone_reset_returns_404(self, client: AsyncClient) -> None:
    counter = (await client.post("/v1/counters", json={"name": "Days"})).json()
    reset = (await client.post(f"/v1/counters/{counter['id']}/resets")).json()
    assert (await client.delete(f"/v1/counters/{counter['id']}/resets/{reset['id']}")).status_code == 204

    resp = await client.delete(f"/v1/counters/{counter['id']}/resets/{reset['id']}")

    assert resp.status_code == 404
