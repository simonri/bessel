from uuid import uuid4

import pytest
from httpx import AsyncClient


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
