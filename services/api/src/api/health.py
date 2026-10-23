from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from api.postgres import DBSession
from api.settings import settings

router = APIRouter()


@router.get("/healthz")
async def healthz(session: DBSession):
  try:
    await session.execute(text("SELECT 1"))
  except SQLAlchemyError as e:
    raise HTTPException(status_code=503, detail="Database is not available") from e

  return {"status": "ok"}


@router.get("/favicon.ico", include_in_schema=False)
async def favicon() -> RedirectResponse:
  """The API host's icon, which clients such as Claude's connector list look for, is the web app's."""
  return RedirectResponse(settings.generate_frontend_url("favicon.ico"))
