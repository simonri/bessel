from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from api.common.utils import utc_now
from api.devices.dependencies import CurrentDevice, OptionalCurrentDevice
from api.exceptions import ResourceNotFound
from api.models.project import Project
from api.postgres import AsyncSession, get_db_session
from api.projects.repository import ProjectDeviceConfigRepository, ProjectRepository
from api.projects.schemas import ProjectCreate, ProjectLocationUpdate, ProjectSchema, ProjectUpdate
from api.projects.service import ResolvedProject, project_service
from api.tasks.repository import TaskRepository
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/projects", tags=["projects"])


async def _get_project_or_404(session: AsyncSession, project_id: UUID, user_id: UUID) -> Project:
  repo = ProjectRepository.from_session(session)
  project = await repo.get_by_id(project_id)
  if not project or project.deleted_at is not None or project.user_id != user_id:
    raise ResourceNotFound(message="Project not found.")
  return project


def _to_schema(resolved: ResolvedProject) -> ProjectSchema:
  return ProjectSchema.model_validate(resolved.project).model_copy(update={"path": resolved.path, "ssh_host": resolved.ssh_host})


@router.get("", summary="List Projects", response_model=list[ProjectSchema])
async def list_projects(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  device: OptionalCurrentDevice,
) -> list[ProjectSchema]:
  resolved = await project_service.list_resolved_for_user(session, current_user.id, device.id if device else None)
  return [_to_schema(r) for r in resolved]


@router.post("", summary="Create Project", response_model=ProjectSchema, status_code=201)
async def create_project(
  body: ProjectCreate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  device: OptionalCurrentDevice,
) -> ProjectSchema:
  repo = ProjectRepository.from_session(session)
  existing = await repo.get_by_name(body.name, user_id=current_user.id)
  if existing:
    return _to_schema(await project_service.resolve_one(session, existing, device.id if device else None))

  project = await repo.create(
    Project(name=body.name, user_id=current_user.id, path=body.path, ssh_host=body.ssh_host),
    flush=True,
  )
  if device and (body.path is not None or body.ssh_host is not None):
    await ProjectDeviceConfigRepository.from_session(session).upsert(project.id, device.id, body.path, body.ssh_host)
  return _to_schema(await project_service.resolve_one(session, project, device.id if device else None))


@router.patch("/{project_id}", summary="Update Project", response_model=ProjectSchema)
async def update_project(
  project_id: UUID,
  body: ProjectUpdate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  device: OptionalCurrentDevice,
) -> ProjectSchema:
  project = await _get_project_or_404(session, project_id, current_user.id)
  repo = ProjectRepository.from_session(session)
  update_dict = body.model_dump(exclude_unset=True)
  if update_dict:
    await repo.update(project, update_dict=update_dict, flush=True)
  return _to_schema(await project_service.resolve_one(session, project, device.id if device else None))


@router.put("/{project_id}/location", summary="Set Project Location For This Device", response_model=ProjectSchema)
async def set_project_location(
  project_id: UUID,
  body: ProjectLocationUpdate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  device: CurrentDevice,
) -> ProjectSchema:
  project = await _get_project_or_404(session, project_id, current_user.id)
  config = await project_service.set_location(session, project, device.id, body.path, body.ssh_host)
  return _to_schema(ResolvedProject(project, config.path, config.ssh_host))


@router.delete("/{project_id}", summary="Delete Project", status_code=204)
async def delete_project(
  project_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> None:
  project = await _get_project_or_404(session, project_id, current_user.id)
  await TaskRepository.from_session(session).detach_from_project(project_id, current_user.id)
  repo = ProjectRepository.from_session(session)
  await repo.update(project, update_dict={"deleted_at": utc_now()})
