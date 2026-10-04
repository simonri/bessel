"""
Run the API on :8200 trusting any bearer token as the first local user, so the
iOS Simulator can be driven without Google sign-in (see apps/ios/README.md).
Development only: refuses to start in any other environment.

Run: cd services/api && uv run python -m scripts.dev_auth_api
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import uvicorn
from api.app import app
from api.auth.dependencies import verify_token
from api.auth.schemas import UserInfo
from api.settings import settings
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


async def _first_user_sub() -> str:
  engine = create_async_engine(settings.get_postgres_dsn("asyncpg"))
  async with engine.connect() as conn:
    row = (await conn.execute(text("SELECT auth0_sub FROM users WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1"))).first()
  await engine.dispose()
  if row is None:
    sys.exit("No user in the database yet: log in to the local app once first.")
  return row[0]


def main() -> None:
  if not settings.is_development():
    sys.exit("dev_auth_api only runs with BESSEL_ENV=development.")
  sub = asyncio.run(_first_user_sub())

  async def trust_any_token() -> UserInfo:
    return UserInfo(sub=sub, email="demo@bessel.app", name="Demo")

  app.dependency_overrides[verify_token] = trust_any_token
  uvicorn.run(app, host="127.0.0.1", port=8200, log_level="warning")


if __name__ == "__main__":
  main()
