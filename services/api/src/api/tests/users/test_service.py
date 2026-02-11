import pytest
from api.postgres import AsyncSession
from api.tests.fixtures.database import SaveFixture
from api.tests.fixtures.random_objects import create_user
from api.users.service import user_service


@pytest.mark.asyncio
class TestGetOrCreateByEmail:
  async def test_creates_new_user(self, save_fixture: SaveFixture, session: AsyncSession):
    """Creates a new user when email doesn't exist"""
    user = await user_service.get_or_create_by_email(session, "new@example.com")

    assert user.email == "new@example.com"

  async def test_returns_existing_user(self, save_fixture: SaveFixture, session: AsyncSession):
    """Returns existing user when email already exists"""
    existing_user = await create_user(save_fixture, email="existing@example.com")

    user = await user_service.get_or_create_by_email(session, "existing@example.com")

    assert user.id == existing_user.id
