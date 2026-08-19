from pathlib import Path
from uuid import uuid4

import pytest
from httpx import AsyncClient

from api.settings import settings


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


A_PNG_BYTES = bytes.fromhex(
  "89504e470d0a1a0a0000000d494844520000000100000001080600000"
  "01f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082"
)


class TestTaskAttachments:
  @pytest.fixture(autouse=True)
  def _isolated_attachments_dir(self, tmp_path: Path) -> None:
    original = settings.TASK_ATTACHMENTS_DIR
    settings.TASK_ATTACHMENTS_DIR = str(tmp_path)
    yield
    settings.TASK_ATTACHMENTS_DIR = original

  @pytest.mark.asyncio
  async def test_upload_get_and_delete_round_trip(self, client: AsyncClient) -> None:
    task = (await client.post("/v1/tasks", json={"title": "A"})).json()

    upload = await client.post(
      f"/v1/tasks/{task['id']}/attachments",
      files={"file": ("screenshot.png", A_PNG_BYTES, "image/png")},
    )
    assert upload.status_code == 201
    attachment = upload.json()
    assert attachment["filename"] == "screenshot.png"
    assert attachment["content_type"] == "image/png"
    assert attachment["size_bytes"] == len(A_PNG_BYTES)
    assert Path(settings.TASK_ATTACHMENTS_DIR, attachment["id"]).read_bytes() == A_PNG_BYTES

    fetched_task = (await client.get(f"/v1/tasks/{task['id']}")).json()
    assert [a["id"] for a in fetched_task["attachments"]] == [attachment["id"]]

    file_resp = await client.get(f"/v1/tasks/{task['id']}/attachments/{attachment['id']}/file")
    assert file_resp.status_code == 200
    assert file_resp.headers["content-type"] == "image/png"
    assert file_resp.content == A_PNG_BYTES

    delete_resp = await client.delete(f"/v1/tasks/{task['id']}/attachments/{attachment['id']}")
    assert delete_resp.status_code == 204
    assert not Path(settings.TASK_ATTACHMENTS_DIR, attachment["id"]).exists()

    fetched_task = (await client.get(f"/v1/tasks/{task['id']}")).json()
    assert fetched_task["attachments"] == []

  @pytest.mark.asyncio
  async def test_upload_rejects_non_image(self, client: AsyncClient) -> None:
    task = (await client.post("/v1/tasks", json={"title": "A"})).json()

    resp = await client.post(
      f"/v1/tasks/{task['id']}/attachments",
      files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 400

  @pytest.mark.asyncio
  async def test_upload_to_missing_task_404s(self, client: AsyncClient) -> None:
    resp = await client.post(
      f"/v1/tasks/{uuid4()}/attachments",
      files={"file": ("screenshot.png", A_PNG_BYTES, "image/png")},
    )
    assert resp.status_code == 404

  @pytest.mark.asyncio
  async def test_deleting_task_removes_attachment_file(self, client: AsyncClient) -> None:
    task = (await client.post("/v1/tasks", json={"title": "A"})).json()
    upload = (
      await client.post(
        f"/v1/tasks/{task['id']}/attachments",
        files={"file": ("screenshot.png", A_PNG_BYTES, "image/png")},
      )
    ).json()

    delete_resp = await client.delete(f"/v1/tasks/{task['id']}")
    assert delete_resp.status_code == 204
    assert not Path(settings.TASK_ATTACHMENTS_DIR, upload["id"]).exists()
