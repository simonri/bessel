from fastapi import APIRouter

from api.auth.schemas import MeResponse
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", summary="Get Current User", response_model=MeResponse)
async def get_me(user: CurrentDBUser) -> MeResponse:
  return MeResponse(id=user.id, email=user.email)
