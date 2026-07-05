from uuid import UUID

import structlog
from sqlalchemy import text

from api.common.db.postgres import AsyncSession
from api.models.user import User
from api.users.repository import UserRepository

log = structlog.get_logger()

# All tables that carry a user_id column.
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
]


class UserService:
  async def get_or_create_by_sub(
    self,
    session: AsyncSession,
    auth0_sub: str,
    email: str | None,
  ) -> User:
    repo = UserRepository.from_session(session)
    user = await repo.get_by_sub(auth0_sub)

    if user:
      # Keep email in sync if it changed in Auth0.
      if email and user.email != email:
        await repo.update(user, update_dict={"email": email}, flush=True)
      return user

    user = User(auth0_sub=auth0_sub, email=email)
    await repo.create(user, flush=True)
    log.info("Created new user", user_id=str(user.id), email=email)

    # First-ever login: claim all data that was created before auth existed.
    await self._claim_orphaned_data(session, user.id)
    return user

  async def _claim_orphaned_data(self, session: AsyncSession, user_id: UUID) -> None:
    for table in _USER_OWNED_TABLES:
      await session.execute(
        text(f"UPDATE {table} SET user_id = :uid WHERE user_id IS NULL"),
        {"uid": str(user_id)},
      )
    log.info("Claimed orphaned data", user_id=str(user_id))


user_service = UserService()
