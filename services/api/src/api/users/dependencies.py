from typing import Annotated

from fastapi import Depends

from api.auth.dependencies import verify_token
from api.auth.schemas import UserInfo
from api.models.user import User
from api.postgres import AsyncSession, get_db_session
from api.users.service import user_service


async def get_current_db_user(
  user_info: Annotated[UserInfo, Depends(verify_token)],
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> User:
  return await user_service.get_or_create_by_sub(session, user_info.sub, user_info.email)


CurrentDBUser = Annotated[User, Depends(get_current_db_user)]
