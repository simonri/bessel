from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.user import User


class UserRepository(RepositoryBase[User], RepositoryIDMixin[User, UUID]):
  model = User

  async def get_by_sub(self, auth0_sub: str) -> User | None:
    stmt = select(User).where(User.auth0_sub == auth0_sub).where(User.deleted_at.is_(None))
    return await self.get_one_or_none(stmt)

  async def list_ids(self) -> Sequence[UUID]:
    result = await self.session.execute(select(User.id).where(User.deleted_at.is_(None)))
    return result.scalars().all()

  async def count(self) -> int:
    result = await self.session.execute(select(func.count()).select_from(User))
    return result.scalar_one()
