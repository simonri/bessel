from collections.abc import AsyncGenerator
from typing import Annotated, Literal

from fastapi import Depends, Request
from starlette.types import ASGIApp, Receive, Scope, Send

from api.common.db.postgres import AsyncEngine, AsyncSession, AsyncSessionMaker, Engine
from api.common.db.postgres import create_async_engine as _create_async_engine
from api.common.db.postgres import create_sync_engine as _create_sync_engine
from api.settings import settings

type ProcessName = Literal["app", "worker", "scheduler", "script"]


def create_async_engine(process_name: ProcessName) -> AsyncEngine:
  return _create_async_engine(
    dsn=str(settings.get_postgres_dsn("asyncpg")),
    application_name=f"{settings.ENV.value}.{process_name}",
    debug=False,
    pool_size=settings.DATABASE_POOL_SIZE,
    pool_recycle=settings.DATABASE_POOL_RECYCLE_SECONDS,
    command_timeout=settings.DATABASE_COMMAND_TIMEOUT_SECONDS,
  )


def create_sync_engine(process_name: ProcessName) -> Engine:
  return _create_sync_engine(
    dsn=str(settings.get_postgres_dsn("psycopg2")),
    application_name=f"{settings.ENV.value}.{process_name}",
    debug=False,
    pool_size=settings.DATABASE_SYNC_POOL_SIZE,
    pool_recycle=settings.DATABASE_POOL_RECYCLE_SECONDS,
    command_timeout=settings.DATABASE_COMMAND_TIMEOUT_SECONDS,
  )


class AsyncSessionMiddleware:
  def __init__(self, app: ASGIApp) -> None:
    self.app = app

  async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
    if scope["type"] not in ("http", "websocket"):
      return await self.app(scope, receive, send)

    sessionmaker: AsyncSessionMaker = scope["state"]["async_sessionmaker"]
    async with sessionmaker() as session:
      scope["state"]["async_session"] = session
      await self.app(scope, receive, send)


async def get_db_sessionmaker(request: Request) -> AsyncSessionMaker:
  return request.state.async_sessionmaker


async def get_db_session(request: Request) -> AsyncGenerator[AsyncSession]:
  try:
    session = request.state.async_session
  except AttributeError as e:
    raise RuntimeError("Session is not present in the request state. Did you forget to add AsyncSessionMiddleware?") from e

  try:
    yield session
  except Exception:
    await session.rollback()
    raise
  else:
    await session.commit()


# Function scope commits before the response is sent, so a client that refetches
# after a 2xx sees its write, and a failed commit becomes a 500 instead of a lost
# write behind a 2xx. Every route must take the session through this alias: mixing
# scopes gives a route two session dependencies, one of which commits too late.
DBSession = Annotated[AsyncSession, Depends(get_db_session, scope="function")]


__all__ = [
  "AsyncEngine",
  "AsyncSession",
  "DBSession",
  "create_async_engine",
  "create_sync_engine",
  "get_db_session",
  "get_db_sessionmaker",
]
