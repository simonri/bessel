from uuid import UUID

from sqlalchemy import select

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.project import Project


class ProjectRepository(RepositoryBase[Project], RepositoryIDMixin[Project, UUID]):
  model = Project

  async def get_by_name(self, name: str) -> Project | None:
    statement = select(Project).where(Project.name == name).where(Project.deleted_at.is_(None))
    return await self.get_one_or_none(statement)
