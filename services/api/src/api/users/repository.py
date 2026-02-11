from sqlalchemy import func, select

from api.common.repository.base import RepositoryBase
from api.models.user import User


class UserRepository(RepositoryBase[User]):
  model = User

  async def count(self) -> int:
    """Return the total count of users."""

    result = await self.session.execute(select(func.count()).select_from(self.model))
    return result.scalar_one()
