import structlog
from sqlalchemy.exc import IntegrityError

from api.common.db.postgres import AsyncSession
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
    user = await repo.get_by_sub(auth0_sub)

    if user:
      # Keep email in sync if it changed in Auth0.
      if email and user.email != email:
        await repo.update(user, update_dict={"email": email}, flush=True)
      return user

    user = User(auth0_sub=auth0_sub, email=email)
    try:
      async with session.begin_nested():
        await repo.create(user, flush=True)
    except IntegrityError:
      # Lost a concurrent-creation race: the other request's row is committed by now.
      user = await repo.get_by_sub(auth0_sub)
      if user is None:
        raise
      return user

    log.info("Created new user", user_id=str(user.id), email=email)

    # Only the first user ever claims pre-auth data; later signups must not
    # steal rows that happen to have a NULL user_id.
    if await repo.count() == 1:
      await repo.claim_orphaned_data(user.id)
      log.info("Claimed orphaned data", user_id=str(user.id))

    return user


user_service = UserService()
