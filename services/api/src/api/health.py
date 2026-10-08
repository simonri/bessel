from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from api.postgres import DBSession

router = APIRouter()


@router.get("/healthz")
async def healthz(session: DBSession):
  try:
    await session.execute(text("SELECT 1"))
  except SQLAlchemyError as e:
    raise HTTPException(status_code=503, detail="Database is not available") from e

  return {"status": "ok"}
