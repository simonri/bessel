from uuid import UUID

from sqlalchemy import select

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.project import Project


class ProjectRepository(RepositoryBase[Project], RepositoryIDMixin[Project, UUID]):
  model = Project

  async def get_by_name(self, name: str, user_id: UUID | None = None) -> Project | None:
    statement = select(Project).where(Project.name == name).where(Project.deleted_at.is_(None))
    if user_id is not None:
      statement = statement.where(Project.user_id == user_id)
    return await self.get_one_or_none(statement)
