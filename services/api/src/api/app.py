from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import TypedDict

import structlog
from fastapi import FastAPI
from starlette.types import Scope

from api import (
  rate_limit,
  tasks,  # noqa: F401
)
from api.api import router as api_router
from api.common.db.postgres import AsyncEngine, AsyncSessionMaker, Engine, create_async_sessionmaker
from api.cors import CORSConfig, CORSMatcherMiddleware
from api.exception_handlers import add_exception_handlers
from api.health import router as health_router
from api.logging import Logger
from api.logging import configure as configure_logging
from api.middlewares import FlushEnqueuedWorkerJobsMiddleware
from api.openapi import OPENAPI_PARAMETERS, set_openapi_generator
from api.postgres import AsyncSessionMiddleware, create_async_engine, create_sync_engine
from api.redis import Redis, create_redis
from api.sentry import configure_sentry
from api.settings import settings

log: Logger = structlog.get_logger()


def configure_cors(app: FastAPI) -> None:
  configs: list[CORSConfig] = []

  if settings.CORS_ORIGINS:

    def frontend_matcher(origin: str, scope: Scope) -> bool:
      return origin in settings.CORS_ORIGINS

    frontend_config = CORSConfig(
      frontend_matcher,
      allow_origins=[str(origin) for origin in settings.CORS_ORIGINS],
      allow_credentials=True,
      allow_methods=["*"],
      allow_headers=["*"],
    )
    configs.append(frontend_config)

  # Only allow wildcard CORS in development for API testing
  # In production, only configured CORS_ORIGINS are allowed
  if settings.is_development():
    api_config = CORSConfig(
      lambda origin, scope: True,
      allow_origins=["*"],
      allow_credentials=False,
      allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allow_headers=["Authorization", "Content-Type"],
    )
    configs.append(api_config)

  app.add_middleware(CORSMatcherMiddleware, configs=configs)


class State(TypedDict):
  async_engine: AsyncEngine
  async_sessionmaker: AsyncSessionMaker
  sync_engine: Engine
  redis: Redis


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[State]:
  log.info("Starting Metron API")

  async_engine = create_async_engine("app")
  async_sessionmaker = create_async_sessionmaker(async_engine)

  sync_engine = create_sync_engine("app")

  redis = create_redis("app")

  log.info("Metron API started")

  yield {
    "async_engine": async_engine,
    "async_sessionmaker": async_sessionmaker,
    "sync_engine": sync_engine,
    "redis": redis,
  }

  await redis.close(True)
  await rate_limit.dispose_redis()
  await async_engine.dispose()
  sync_engine.dispose()

  log.info("Metron API stopped")


def create_app() -> FastAPI:
  app = FastAPI(lifespan=lifespan, **OPENAPI_PARAMETERS)

  if not settings.is_testing():
    app.add_middleware(rate_limit.get_middleware)
    app.add_middleware(FlushEnqueuedWorkerJobsMiddleware)
    app.add_middleware(AsyncSessionMiddleware)

  configure_cors(app)
  add_exception_handlers(app)

  app.include_router(health_router)
  app.include_router(api_router)

  return app


configure_sentry()
configure_logging()

app = create_app()
set_openapi_generator(app)
