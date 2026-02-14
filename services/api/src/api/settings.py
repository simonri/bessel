import os
from enum import StrEnum
from typing import Literal

from pydantic import Field, PostgresDsn, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
  development = "development"
  testing = "testing"
  production = "production"


class EmailSender(StrEnum):
  logger = "logger"
  aws = "aws"


env = Environment(os.getenv("ENV", Environment.development))
env_file = ".env.testing" if env == Environment.testing else ".env"

file_extension = ".exe" if os.name == "nt" else ""


class Settings(BaseSettings):
  ENV: Environment = Environment.development
  LOG_LEVEL: str = "DEBUG"

  CORS_ORIGINS: list[str] = Field(
    default=[
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3001",
    ]
  )
  FRONTEND_BASE_URL: str = Field(default="http://localhost:5173")

  # Redis
  REDIS_HOST: str = "127.0.0.1"
  REDIS_PORT: int = 6379
  REDIS_DB: int = 0

  # Database
  POSTGRES_USER: str = ""
  POSTGRES_PASSWORD: str = Field(default="")
  POSTGRES_HOST: str = "127.0.0.1"
  POSTGRES_PORT: int = 5432
  POSTGRES_DB: str = Field(default="flow")

  DATABASE_POOL_SIZE: int = Field(default=5)
  DATABASE_SYNC_POOL_SIZE: int = Field(default=1)
  DATABASE_POOL_RECYCLE_SECONDS: int = Field(default=600)  # 10 minutes
  DATABASE_COMMAND_TIMEOUT_SECONDS: int = Field(default=30)

  # Bulk jobs spread settings
  BULK_JOBS_SPREAD_THRESHOLD: int = 50
  BULK_JOBS_SPREAD_TARGET_DELAY_MS: int = 200
  BULK_JOBS_SPREAD_MIN_DELAY_MS: int = 50
  BULK_JOBS_SPREAD_MAX_MS: int = 300_000

  # Worker
  WORKER_MAX_RETRIES: int = 20
  WORKER_MIN_BACKOFF_MILLISECONDS: int = 2_000

  model_config = SettingsConfigDict(env_prefix="metron_", env_file_encoding="utf-8", case_sensitive=False, env_file=env_file, extra="allow")

  def get_postgres_dsn(self, driver: Literal["asyncpg", "psycopg2"]) -> str:
    return str(
      PostgresDsn.build(
        scheme=f"postgresql+{driver}",
        username=self.POSTGRES_USER,
        password=self.POSTGRES_PASSWORD,
        host=self.POSTGRES_HOST,
        port=self.POSTGRES_PORT,
        path=self.POSTGRES_DB,
      )
    )

  def get_postgres_read_dsn(self, driver: Literal["asyncpg", "psycopg2"]) -> str | None:
    return None

  @property
  def redis_url(self) -> str:
    return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

  def is_environment(self, environments: set[Environment]) -> bool:
    return self.ENV in environments

  def is_testing(self) -> bool:
    return self.is_environment({Environment.testing})

  def is_development(self) -> bool:
    return self.is_environment({Environment.development})

  def generate_frontend_url(self, path: str) -> str:
    return f"{self.FRONTEND_BASE_URL}/{path}"

  @model_validator(mode="after")
  def validate_production_settings(self) -> "Settings":
    """Validate that required settings are configured in production."""
    if self.ENV == Environment.production:
      missing = []

      # Required database settings
      if not self.POSTGRES_USER:
        missing.append("POSTGRES_USER")
      if not self.POSTGRES_PASSWORD:
        missing.append("POSTGRES_PASSWORD")

      if missing:
        raise ValueError(f"Missing required environment variables for production: {', '.join(missing)}")

    return self


settings = Settings()
