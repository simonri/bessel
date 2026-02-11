from uuid import UUID

from api.common.db.postgres import AsyncSession
from api.models.user import User
from api.users.repository import UserRepository


class UserService:
  async def get_by_id(self, session: AsyncSession, user_id: UUID) -> User | None:
    """Get a user by ID."""
    user_repo = UserRepository.from_session(session)
    statement = user_repo.get_base_statement().where(User.id == user_id)
    return await user_repo.get_one_or_none(statement)

  async def get_or_create_by_email(self, session: AsyncSession, email: str) -> User:
    """
    Get an existing user by email or create a new one.

    If the user already exists, returns the existing user.
    If the user doesn't exist, creates a new user with the given email.
    """
    user_repo = UserRepository.from_session(session)

    statement = user_repo.get_base_statement().where(User.email == email)
    existing_user = await user_repo.get_one_or_none(statement)

    if existing_user:
      return existing_user

    user = User(email=email)
    await user_repo.create(user, flush=True)
    return user


user_service: UserService = UserService()
