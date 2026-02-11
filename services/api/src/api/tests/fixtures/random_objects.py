import pytest_asyncio
from api.models.user import User
from api.tests.fixtures.database import SaveFixture


async def create_user(
  save_fixture: SaveFixture,
  *,
  email: str = "test@example.com",
) -> User:
  user = User(email=email)
  await save_fixture(user)
  return user


@pytest_asyncio.fixture
async def user(save_fixture: SaveFixture) -> User:
  return await create_user(save_fixture)
