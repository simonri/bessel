from pathlib import Path
from uuid import uuid4

import pytest
from api.common.utils import utc_now
from api.models.task import Task
from api.models.user import User
from api.settings import settings
from api.tests.fixtures.database import SaveFixture
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


class TestRemovedAreas:
  @pytest.mark.asyncio
  async def test_old_clients_still_get_an_empty_list(self, client: AsyncClient) -> None:
    response = await client.get("/v1/tasks/areas")
    assert response.status_code == 200
    assert response.json() == []

  @pytest.mark.asyncio
  async def test_an_area_sent_by_an_old_client_is_ignored(self, client: AsyncClient) -> None:
    response = await client.post("/v1/tasks", json={"title": "Pack", "area": "Travel", "position": 1.0})
    assert response.status_code == 201
    assert "area" not in response.json()


class TestSoftDeleted:
  @pytest.mark.asyncio
  async def test_a_soft_deleted_record_is_gone_by_id_too(self, client: AsyncClient, user: User, save_fixture: SaveFixture) -> None:
    task = Task(title="Old idea", user_id=user.id, status="todo", position=1.0, deleted_at=utc_now())
    await save_fixture(task)

    assert (await client.get(f"/v1/tasks/{task.id}")).status_code == 404
    assert (await client.patch(f"/v1/tasks/{task.id}", json={"title": "Back?"})).status_code == 404
    assert (await client.delete(f"/v1/tasks/{task.id}")).status_code == 404


class TestTaskUndoComplete:
  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_reopens_and_removes_the_spawned_occurrence(self, client: AsyncClient) -> None:
    routine = (
      await client.post("/v1/tasks", json={"title": "Water plants", "is_recurring": True, "rrule_frequency": "weekly", "due_date": "2026-10-07"})
    ).json()
    completed = (await client.post(f"/v1/tasks/{routine['id']}/complete")).json()
    next_id = completed["next_task"]["id"]

    resp = await client.post(f"/v1/tasks/{routine['id']}/undo-complete")

    assert resp.status_code == 200
    assert (resp.json()["status"], resp.json()["completed_at"]) == ("todo", None)
    assert (await client.get(f"/v1/tasks/{next_id}")).status_code == 404

  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_undoing_twice_leaves_later_occurrences_alone(self, client: AsyncClient) -> None:
    routine = (
      await client.post("/v1/tasks", json={"title": "Water plants", "is_recurring": True, "rrule_frequency": "daily", "due_date": "2026-10-07"})
    ).json()
    await client.post(f"/v1/tasks/{routine['id']}/complete")
    await client.post(f"/v1/tasks/{routine['id']}/undo-complete")
    respawned = (await client.post(f"/v1/tasks/{routine['id']}/complete")).json()["next_task"]
    await client.post(f"/v1/tasks/{routine['id']}/reopen")

    resp = await client.post(f"/v1/tasks/{routine['id']}/undo-complete")

    assert resp.status_code == 200
    assert (await client.get(f"/v1/tasks/{respawned['id']}")).status_code == 200

  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_keeps_an_occurrence_already_done(self, client: AsyncClient) -> None:
    routine = (await client.post("/v1/tasks", json={"title": "Stretch", "is_recurring": True, "rrule_frequency": "daily", "due_date": "2026-10-07"})).json()
    next_task = (await client.post(f"/v1/tasks/{routine['id']}/complete")).json()["next_task"]
    await client.post(f"/v1/tasks/{next_task['id']}/complete")

    await client.post(f"/v1/tasks/{routine['id']}/undo-complete")

    assert (await client.get(f"/v1/tasks/{next_task['id']}")).json()["status"] == "done"

  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_works_for_one_off_tasks(self, client: AsyncClient) -> None:
    task = (await client.post("/v1/tasks", json={"title": "Call mum"})).json()
    await client.post(f"/v1/tasks/{task['id']}/complete")

    resp = await client.post(f"/v1/tasks/{task['id']}/undo-complete")

    assert resp.json()["status"] == "todo"

  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_other_users_task_is_not_found(self, client: AsyncClient, other_client: AsyncClient) -> None:
    task = (await client.post("/v1/tasks", json={"title": "Mine"})).json()
    await client.post(f"/v1/tasks/{task['id']}/complete")

    resp = await other_client.post(f"/v1/tasks/{task['id']}/undo-complete")

    assert resp.status_code == 404
    assert (await client.get(f"/v1/tasks/{task['id']}")).json()["status"] == "done"


A_PNG_BYTES = bytes.fromhex(
  "89504e470d0a1a0a0000000d494844520000000100000001080600000" + "01f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082"
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
