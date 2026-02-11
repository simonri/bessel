from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from api.postgres import AsyncSession, get_db_session

router = APIRouter()


@router.get("/healthz")
async def healthz(session: Annotated[AsyncSession, Depends(get_db_session)]):
  try:
    await session.execute(text("SELECT 1"))
  except SQLAlchemyError as e:
    raise HTTPException(status_code=503, detail="Database is not available") from e

  return {"status": "ok"}
