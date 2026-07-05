from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from api.common.utils import utc_now
from api.exceptions import ResourceNotFound
from api.models.project import Project
from api.postgres import AsyncSession, get_db_session
from api.projects.repository import ProjectRepository
from api.projects.schemas import ProjectCreate, ProjectSchema, ProjectUpdate
from api.tasks.repository import TaskRepository
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/projects", tags=["projects"])


async def _get_project_or_404(session: AsyncSession, project_id: UUID, user_id: UUID) -> Project:
  repo = ProjectRepository.from_session(session)
  project = await repo.get_by_id(project_id)
  if not project or project.deleted_at is not None or project.user_id != user_id:
    raise ResourceNotFound(detail="Project not found.")
  return project


@router.get("", summary="List Projects", response_model=list[ProjectSchema])
async def list_projects(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> list[ProjectSchema]:
  repo = ProjectRepository.from_session(session)
  projects = await repo.list_for_user(current_user.id)
  return [ProjectSchema.model_validate(p) for p in projects]


@router.post("", summary="Create Project", response_model=ProjectSchema, status_code=201)
async def create_project(
  body: ProjectCreate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> ProjectSchema:
  repo = ProjectRepository.from_session(session)
  existing = await repo.get_by_name(body.name, user_id=current_user.id)
  if existing:
    return ProjectSchema.model_validate(existing)
  project = await repo.create(
    Project(name=body.name, user_id=current_user.id, path=body.path, ssh_host=body.ssh_host),
    flush=True,
  )
  return ProjectSchema.model_validate(project)


@router.patch("/{project_id}", summary="Update Project", response_model=ProjectSchema)
async def update_project(
  project_id: UUID,
  body: ProjectUpdate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> ProjectSchema:
  project = await _get_project_or_404(session, project_id, current_user.id)
  repo = ProjectRepository.from_session(session)
  update_dict = body.model_dump(exclude_unset=True)
  if update_dict:
    await repo.update(project, update_dict=update_dict, flush=True)
  return ProjectSchema.model_validate(project)


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
