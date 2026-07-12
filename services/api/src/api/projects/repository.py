from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.project import Project
from api.models.project_device_config import ProjectDeviceConfig


class ProjectRepository(RepositoryBase[Project], RepositoryIDMixin[Project, UUID]):
  model = Project

  async def list_for_user(self, user_id: UUID) -> Sequence[Project]:
    statement = select(Project).where(Project.deleted_at.is_(None)).where(Project.user_id == user_id).order_by(Project.name)
    return await self.get_all(statement)

  async def get_by_name(self, name: str, user_id: UUID | None = None) -> Project | None:
    statement = select(Project).where(Project.name == name).where(Project.deleted_at.is_(None))
    if user_id is not None:
      statement = statement.where(Project.user_id == user_id)
    return await self.get_one_or_none(statement)


class ProjectDeviceConfigRepository(RepositoryBase[ProjectDeviceConfig], RepositoryIDMixin[ProjectDeviceConfig, UUID]):
  model = ProjectDeviceConfig

  async def get_for_device(self, project_id: UUID, device_id: UUID) -> ProjectDeviceConfig | None:
    statement = select(ProjectDeviceConfig).where(ProjectDeviceConfig.project_id == project_id).where(ProjectDeviceConfig.device_id == device_id)
    return await self.get_one_or_none(statement)

  async def list_for_device(self, project_ids: Sequence[UUID], device_id: UUID) -> Sequence[ProjectDeviceConfig]:
    if not project_ids:
      return []
    statement = select(ProjectDeviceConfig).where(ProjectDeviceConfig.project_id.in_(project_ids)).where(ProjectDeviceConfig.device_id == device_id)
    return await self.get_all(statement)

  async def list_configured_project_ids(self, project_ids: Sequence[UUID]) -> set[UUID]:
    """Project ids that already have a config from any device."""
    if not project_ids:
      return set()
    statement = select(ProjectDeviceConfig.project_id).where(ProjectDeviceConfig.project_id.in_(project_ids)).distinct()
    result = await self.session.execute(statement)
    return set(result.scalars().all())

  async def upsert(self, project_id: UUID, device_id: UUID, path: str | None, ssh_host: str | None) -> ProjectDeviceConfig:
    existing = await self.get_for_device(project_id, device_id)
    if existing:
      return await self.update(existing, update_dict={"path": path, "ssh_host": ssh_host}, flush=True)
    return await self.create(ProjectDeviceConfig(project_id=project_id, device_id=device_id, path=path, ssh_host=ssh_host), flush=True)
