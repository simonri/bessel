from collections.abc import Sequence
from dataclasses import dataclass
from uuid import UUID

from api.common.db.postgres import AsyncSession
from api.models.project import Project
from api.models.project_device_config import ProjectDeviceConfig
from api.projects.repository import ProjectDeviceConfigRepository, ProjectRepository


@dataclass(slots=True)
class ResolvedProject:
  project: Project
  path: str | None
  ssh_host: str | None


class ProjectService:
  async def list_resolved_for_user(self, session: AsyncSession, user_id: UUID, device_id: UUID | None) -> list[ResolvedProject]:
    projects = await ProjectRepository.from_session(session).list_for_user(user_id)
    return await self._resolve(session, projects, device_id)

  async def resolve_one(self, session: AsyncSession, project: Project, device_id: UUID | None) -> ResolvedProject:
    return (await self._resolve(session, [project], device_id))[0]

  async def _resolve(self, session: AsyncSession, projects: Sequence[Project], device_id: UUID | None) -> list[ResolvedProject]:
    if not projects:
      return []
    if device_id is None:
      # No device context (a browser-only session, with no local filesystem to
      # resolve a path for) — fall back to the project's own default fields.
      return [ResolvedProject(project, project.path, project.ssh_host) for project in projects]

    config_repo = ProjectDeviceConfigRepository.from_session(session)
    project_ids = [p.id for p in projects]
    own_configs = {c.project_id: c for c in await config_repo.list_for_device(project_ids, device_id)}
    unconfigured_ids = [pid for pid in project_ids if pid not in own_configs]
    configured_elsewhere = await config_repo.list_configured_project_ids(unconfigured_ids)

    resolved: list[ResolvedProject] = []
    for project in projects:
      own = own_configs.get(project.id)
      if own:
        resolved.append(ResolvedProject(project, own.path, own.ssh_host))
      elif project.id not in configured_elsewhere:
        # First device ever to see this project — adopt the shared default as this
        # device's own config, so upgrading a single-device install is a no-op.
        config = await config_repo.upsert(project.id, device_id, project.path, project.ssh_host)
        resolved.append(ResolvedProject(project, config.path, config.ssh_host))
      else:
        resolved.append(ResolvedProject(project, None, None))
    return resolved

  async def set_location(
    self,
    session: AsyncSession,
    project: Project,
    device_id: UUID,
    path: str | None,
    ssh_host: str | None,
  ) -> ProjectDeviceConfig:
    config = await ProjectDeviceConfigRepository.from_session(session).upsert(project.id, device_id, path, ssh_host)
    if project.path is None and project.ssh_host is None:
      await ProjectRepository.from_session(session).update(project, update_dict={"path": path, "ssh_host": ssh_host}, flush=True)
    return config


project_service = ProjectService()
