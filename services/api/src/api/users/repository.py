from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select, text

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.user import User

# All tables that carry a user_id column. Pre-auth rows have user_id NULL and are
# claimed by the first user ever created.
_USER_OWNED_TABLES = [
  "tasks",
  "projects",
  "categories",
  "transactions",
  "bank_accounts",
  "places",
  "counters",
  "counter_resets",
  "recipes",
  "notifications",
  "activity_events",
  "trades",
  "healthkit_workouts",
  "healthkit_sleep_samples",
]


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

  async def claim_orphaned_data(self, user_id: UUID) -> None:
    for table in _USER_OWNED_TABLES:
      await self.session.execute(
        text(f"UPDATE {table} SET user_id = :uid WHERE user_id IS NULL"),
        {"uid": str(user_id)},
      )
