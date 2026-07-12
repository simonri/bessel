import pytest
from api.models.device import Device
from api.models.project import Project
from api.models.project_device_config import ProjectDeviceConfig
from api.models.user import User
from api.tests.fixtures.base import TEST_USER_INFO
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

DEVICE_A = {"X-Device-Id": "device-a"}
DEVICE_B = {"X-Device-Id": "device-b"}


class TestProjectLocation:
  @pytest.mark.asyncio
  async def test_create_with_path_resolves_on_creating_device(self, client: AsyncClient) -> None:
    resp = await client.post("/v1/projects", json={"name": "metron", "path": "/home/simon/dev/metron"}, headers=DEVICE_A)
    assert resp.status_code == 201
    assert resp.json()["path"] == "/home/simon/dev/metron"

  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_second_device_sees_unconfigured_project(self, client: AsyncClient) -> None:
    created = await client.post("/v1/projects", json={"name": "metron", "path": "/home/simon/dev/metron"}, headers=DEVICE_A)
    project_id = created.json()["id"]

    listed = await client.get("/v1/projects", headers=DEVICE_B)
    [project] = [p for p in listed.json() if p["id"] == project_id]
    assert project["path"] is None
    assert project["ssh_host"] is None

  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_second_device_can_configure_independently(self, client: AsyncClient) -> None:
    created = await client.post("/v1/projects", json={"name": "metron", "path": "/home/simon/dev/metron"}, headers=DEVICE_A)
    project_id = created.json()["id"]

    set_resp = await client.put(f"/v1/projects/{project_id}/location", json={"path": "/Users/simon/metron", "ssh_host": None}, headers=DEVICE_B)
    assert set_resp.status_code == 200
    assert set_resp.json()["path"] == "/Users/simon/metron"

    device_a_view = await client.get("/v1/projects", headers=DEVICE_A)
    [project_a] = [p for p in device_a_view.json() if p["id"] == project_id]
    assert project_a["path"] == "/home/simon/dev/metron"

    device_b_view = await client.get("/v1/projects", headers=DEVICE_B)
    [project_b] = [p for p in device_b_view.json() if p["id"] == project_id]
    assert project_b["path"] == "/Users/simon/metron"

  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_legacy_project_is_auto_adopted_by_first_device(self, client: AsyncClient, session: AsyncSession) -> None:
    # Simulate a project created before per-device locations existed: a Project row
    # with a path but zero ProjectDeviceConfig rows.
    await client.get("/v1/devices", headers=DEVICE_A)  # ensures the test user exists
    user = (await session.execute(select(User).where(User.auth0_sub == TEST_USER_INFO.sub))).scalar_one()
    project = Project(name="legacy-project", user_id=user.id, path="/home/simon/dev/legacy", ssh_host=None)
    session.add(project)
    await session.flush()

    resp = await client.get("/v1/projects", headers=DEVICE_A)
    [found] = [p for p in resp.json() if p["id"] == str(project.id)]
    assert found["path"] == "/home/simon/dev/legacy"

    config = (await session.execute(select(ProjectDeviceConfig).where(ProjectDeviceConfig.project_id == project.id))).scalar_one()
    assert config.path == "/home/simon/dev/legacy"

    # A second device must not silently inherit the first device's adopted config.
    other_resp = await client.get("/v1/projects", headers=DEVICE_B)
    [found_other] = [p for p in other_resp.json() if p["id"] == str(project.id)]
    assert found_other["path"] is None

  @pytest.mark.asyncio
  async def test_update_name_does_not_require_location(self, client: AsyncClient) -> None:
    created = await client.post("/v1/projects", json={"name": "metron"}, headers=DEVICE_A)
    project_id = created.json()["id"]

    resp = await client.patch(f"/v1/projects/{project_id}", json={"name": "renamed"}, headers=DEVICE_A)
    assert resp.status_code == 200
    assert resp.json()["name"] == "renamed"

  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_list_without_device_header_returns_default_path(self, client: AsyncClient) -> None:
    created = await client.post("/v1/projects", json={"name": "metron", "path": "/home/simon/dev/metron"}, headers=DEVICE_A)
    project_id = created.json()["id"]

    resp = await client.get("/v1/projects")
    assert resp.status_code == 200
    [project] = [p for p in resp.json() if p["id"] == project_id]
    assert project["path"] == "/home/simon/dev/metron"

  @pytest.mark.asyncio
  async def test_location_requires_device_header(self, client: AsyncClient) -> None:
    created = await client.post("/v1/projects", json={"name": "metron"}, headers=DEVICE_A)
    project_id = created.json()["id"]

    resp = await client.put(f"/v1/projects/{project_id}/location", json={"path": "/tmp"})
    assert resp.status_code == 400


class TestDevices:
  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_device_self_registers_on_first_project_request(self, client: AsyncClient) -> None:
    await client.get("/v1/projects", headers=DEVICE_A)

    resp = await client.get("/v1/devices", headers=DEVICE_A)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["name"] == "Unnamed device"

  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_named_device_registers_with_given_name(self, client: AsyncClient) -> None:
    await client.get("/v1/projects", headers={**DEVICE_A, "X-Device-Name": "Simon's Desktop"})

    resp = await client.get("/v1/devices", headers=DEVICE_A)
    assert resp.json()[0]["name"] == "Simon's Desktop"

  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_rename_device(self, client: AsyncClient) -> None:
    await client.get("/v1/projects", headers=DEVICE_A)
    listed = await client.get("/v1/devices", headers=DEVICE_A)
    device_id = listed.json()[0]["id"]

    resp = await client.patch(f"/v1/devices/{device_id}", json={"name": "Home Desktop"}, headers=DEVICE_A)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Home Desktop"

  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_delete_device_cascades_project_configs(self, client: AsyncClient, session: AsyncSession) -> None:
    created = await client.post("/v1/projects", json={"name": "metron", "path": "/home/simon/dev/metron"}, headers=DEVICE_A)
    project_id = created.json()["id"]

    listed = await client.get("/v1/devices", headers=DEVICE_A)
    device_id = listed.json()[0]["id"]

    resp = await client.delete(f"/v1/devices/{device_id}", headers=DEVICE_A)
    assert resp.status_code == 204

    remaining = (await session.execute(select(Device).where(Device.id == device_id))).scalar_one_or_none()
    assert remaining is None

    orphaned_configs = (await session.execute(select(ProjectDeviceConfig).where(ProjectDeviceConfig.project_id == project_id))).scalars().all()
    assert orphaned_configs == []

  @pytest.mark.asyncio
  async def test_delete_unknown_device_404s(self, client: AsyncClient) -> None:
    resp = await client.delete("/v1/devices/00000000-0000-0000-0000-000000000000", headers=DEVICE_A)
    assert resp.status_code == 404
