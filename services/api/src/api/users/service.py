import structlog

from api.common.db.postgres import AsyncSession
from api.common.repository.get_or_create import get_or_create
from api.models.user import User
from api.users.repository import UserRepository

log = structlog.get_logger()


class UserService:
  async def get_or_create_by_sub(
    self,
    session: AsyncSession,
    auth0_sub: str,
    email: str | None,
  ) -> User:
    repo = UserRepository.from_session(session)

    async def on_found(user: User) -> User:
      # Keep email in sync if it changed in Auth0.
      if email and user.email != email:
        await repo.update(user, update_dict={"email": email}, flush=True)
      return user

    user, created = await get_or_create(
      session,
      fetch=lambda: repo.get_by_sub(auth0_sub),
      on_found=on_found,
      build=lambda: User(auth0_sub=auth0_sub, email=email),
      create=lambda new_user: repo.create(new_user, flush=True),
    )

    if not created:
      return user

    log.info("Created new user", user_id=str(user.id), email=email)

    # Only the first user ever claims pre-auth data; later signups must not
    # steal rows that happen to have a NULL user_id.
    if await repo.count() == 1:
      await repo.claim_orphaned_data(user.id)
      log.info("Claimed orphaned data", user_id=str(user.id))

    return user


user_service = UserService()
