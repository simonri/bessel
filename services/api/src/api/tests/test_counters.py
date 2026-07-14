from uuid import uuid4

import pytest
from httpx import AsyncClient


class TestCounterNotFound:
  @pytest.mark.asyncio
  async def test_update_missing_returns_404(self, client: AsyncClient) -> None:
    resp = await client.patch(f"/v1/counters/{uuid4()}", json={"name": "Nope"})
    assert resp.status_code == 404

  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_undo_missing_reset_returns_404(self, client: AsyncClient) -> None:
    counter = (await client.post("/v1/counters", json={"name": "Days"})).json()

    resp = await client.delete(f"/v1/counters/{counter['id']}/resets/{uuid4()}")
    assert resp.status_code == 404
