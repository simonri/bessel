from uuid import uuid4

import pytest
from httpx import AsyncClient


class TestTaskReorder:
  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_reorder_updates_positions(self, client: AsyncClient) -> None:
    task_a = (await client.post("/v1/tasks", json={"title": "A"})).json()
    task_b = (await client.post("/v1/tasks", json={"title": "B"})).json()

    resp = await client.patch(
      "/v1/tasks/reorder",
      json=[
        {"id": task_a["id"], "position": 2000},
        {"id": task_b["id"], "position": 1000},
      ],
    )
    assert resp.status_code == 204

    assert (await client.get(f"/v1/tasks/{task_a['id']}")).json()["position"] == 2000
    assert (await client.get(f"/v1/tasks/{task_b['id']}")).json()["position"] == 1000

  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_reorder_item_can_carry_status_change(self, client: AsyncClient) -> None:
    task = (await client.post("/v1/tasks", json={"title": "A"})).json()

    resp = await client.patch(
      "/v1/tasks/reorder",
      json=[{"id": task["id"], "position": 3000, "status": "in_progress"}],
    )
    assert resp.status_code == 204

    fetched = (await client.get(f"/v1/tasks/{task['id']}")).json()
    assert fetched["position"] == 3000
    assert fetched["status"] == "in_progress"

  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_reorder_skips_unknown_ids(self, client: AsyncClient) -> None:
    task = (await client.post("/v1/tasks", json={"title": "A"})).json()

    resp = await client.patch(
      "/v1/tasks/reorder",
      json=[
        {"id": str(uuid4()), "position": 500},
        {"id": task["id"], "position": 4000},
      ],
    )
    assert resp.status_code == 204
    assert (await client.get(f"/v1/tasks/{task['id']}")).json()["position"] == 4000


class TestTaskNotFound:
  @pytest.mark.asyncio
  async def test_get_missing_returns_404(self, client: AsyncClient) -> None:
    resp = await client.get(f"/v1/tasks/{uuid4()}")
    assert resp.status_code == 404
