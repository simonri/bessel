from fastapi import APIRouter

from api.auth.dependencies import CurrentUser
from api.auth.schemas import UserInfo

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", summary="Get Current User", response_model=UserInfo)
async def get_me(user: CurrentUser) -> UserInfo:
  """Get information about the currently authenticated user."""
  return user
