from typing import Annotated

from api.postgres import AsyncSession, get_db_session
from api.users.schemas import UnsubscribeResponse, UserEmailResponse
from api.users.service import user_service
from api.users.tokens import verify_unsubscribe_token
from fastapi import APIRouter, Depends, HTTPException, status

router = APIRouter(prefix="/users")


@router.get(
  "/unsubscribe/{token}",
  summary="Unsubscribe from newsletter",
  response_model=UnsubscribeResponse,
)
async def unsubscribe(
  token: str,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> UnsubscribeResponse:
  """
  Unsubscribe a user from the newsletter using a signed token.

  The token contains the user ID and is verified using HMAC.
  This endpoint is public and does not require authentication.
  """
  user_id = verify_unsubscribe_token(token)

  if user_id is None:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Invalid or expired unsubscribe token",
    )

  user = await user_service.unsubscribe(session, user_id)

  if user is None:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="User not found",
    )

  return UnsubscribeResponse(success=True, message="You have been unsubscribed from our newsletter")


@router.get(
  "/email/{token}",
  summary="Get user email from token",
  response_model=UserEmailResponse,
)
async def get_email(
  token: str,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> UserEmailResponse:
  """
  Get the email address associated with a user token.

  The token is verified using HMAC before returning the email.
  This endpoint is public and does not require authentication.
  """
  user_id = verify_unsubscribe_token(token)

  if user_id is None:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Invalid token",
    )

  user = await user_service.get_by_id(session, user_id)

  if user is None:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="User not found",
    )

  return UserEmailResponse(email=user.email)
