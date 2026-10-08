from fastapi import APIRouter

from api.auth.schemas import MeResponse, MeUpdate
from api.postgres import DBSession
from api.users.dependencies import CurrentDBUser
from api.users.repository import UserRepository

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", summary="Get Current User", response_model=MeResponse)
async def get_me(user: CurrentDBUser) -> MeResponse:
  return MeResponse(id=user.id, email=user.email, timezone=user.timezone)


@router.patch("/me", summary="Update Current User", response_model=MeResponse)
async def update_me(body: MeUpdate, session: DBSession, user: CurrentDBUser) -> MeResponse:
  await UserRepository.from_session(session).update(user, update_dict={"timezone": body.timezone}, flush=True)
  return MeResponse(id=user.id, email=user.email, timezone=user.timezone)
