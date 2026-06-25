from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select, update

from api.common.utils import utc_now
from api.exceptions import ResourceNotFound
from api.models.project import Project
from api.models.task import Task
from api.postgres import AsyncSession, get_db_session
from api.projects.repository import ProjectRepository
from api.projects.schemas import ProjectCreate, ProjectSchema, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


async def _get_project_or_404(session: AsyncSession, project_id: UUID) -> Project:
  repo = ProjectRepository.from_session(session)
  project = await repo.get_by_id(project_id)
  if not project or project.deleted_at is not None:
    raise ResourceNotFound(detail="Project not found.")
  return project


@router.get("", summary="List Projects", response_model=list[ProjectSchema])
async def list_projects(
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[ProjectSchema]:
  rows = (await session.execute(select(Project).where(Project.deleted_at.is_(None)).order_by(Project.name))).scalars().all()
  return [ProjectSchema.model_validate(p) for p in rows]


@router.post("", summary="Create Project", response_model=ProjectSchema, status_code=201)
async def create_project(
  body: ProjectCreate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ProjectSchema:
  repo = ProjectRepository.from_session(session)
  existing = await repo.get_by_name(body.name)
  if existing:
    return ProjectSchema.model_validate(existing)
  project = await repo.create(Project(name=body.name), flush=True)
  return ProjectSchema.model_validate(project)


@router.patch("/{project_id}", summary="Update Project", response_model=ProjectSchema)
async def update_project(
  project_id: UUID,
  body: ProjectUpdate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ProjectSchema:
  project = await _get_project_or_404(session, project_id)
  repo = ProjectRepository.from_session(session)
  update_dict = body.model_dump(exclude_unset=True)
  if update_dict:
    await repo.update(project, update_dict=update_dict, flush=True)
  return ProjectSchema.model_validate(project)


@router.delete("/{project_id}", summary="Delete Project", status_code=204)
async def delete_project(
  project_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
  project = await _get_project_or_404(session, project_id)
  await session.execute(update(Task).where(Task.project_id == project_id).values(project_id=None))
  repo = ProjectRepository.from_session(session)
  await repo.update(project, update_dict={"deleted_at": utc_now()})
