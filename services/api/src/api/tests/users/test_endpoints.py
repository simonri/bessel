import uuid

import pytest
from api.tests.fixtures.database import SaveFixture
from api.tests.fixtures.random_objects import create_user
from api.users.tokens import generate_unsubscribe_token
from httpx import AsyncClient


@pytest.mark.asyncio
class TestUnsubscribe:
  async def test_valid_token_unsubscribes_user(self, client: AsyncClient, save_fixture: SaveFixture):
    """Valid token successfully unsubscribes user"""
    user = await create_user(save_fixture, email="unsub@example.com", unsubscribed=False)
    token = generate_unsubscribe_token(user.id)

    response = await client.get(f"/v1/users/unsubscribe/{token}")

    assert response.status_code == 200
    json = response.json()
    assert json["success"] is True
    assert "unsubscribed" in json["message"].lower()

  async def test_invalid_token_returns_400(self, client: AsyncClient):
    """Invalid token returns 400"""
    response = await client.get("/v1/users/unsubscribe/invalid-token")

    assert response.status_code == 400
    assert "invalid" in response.json()["detail"].lower()

  async def test_nonexistent_user_returns_404(self, client: AsyncClient):
    """Token for non-existent user returns 404"""
    fake_user_id = uuid.uuid4()
    token = generate_unsubscribe_token(fake_user_id)

    response = await client.get(f"/v1/users/unsubscribe/{token}")

    assert response.status_code == 404

  async def test_already_unsubscribed_user_succeeds(self, client: AsyncClient, save_fixture: SaveFixture):
    """Unsubscribing already unsubscribed user still succeeds"""
    user = await create_user(save_fixture, email="already@example.com", unsubscribed=True)
    token = generate_unsubscribe_token(user.id)

    response = await client.get(f"/v1/users/unsubscribe/{token}")

    assert response.status_code == 200
    assert response.json()["success"] is True


@pytest.mark.asyncio
class TestGetEmail:
  async def test_valid_token_returns_email(self, client: AsyncClient, save_fixture: SaveFixture):
    """Valid token returns user email"""
    user = await create_user(save_fixture, email="test@example.com")
    token = generate_unsubscribe_token(user.id)

    response = await client.get(f"/v1/users/email/{token}")

    assert response.status_code == 200
    assert response.json()["email"] == "test@example.com"

  async def test_invalid_token_returns_400(self, client: AsyncClient):
    """Invalid token returns 400"""
    response = await client.get("/v1/users/email/invalid-token")

    assert response.status_code == 400

  async def test_nonexistent_user_returns_404(self, client: AsyncClient):
    """Token for non-existent user returns 404"""
    fake_user_id = uuid.uuid4()
    token = generate_unsubscribe_token(fake_user_id)

    response = await client.get(f"/v1/users/email/{token}")

    assert response.status_code == 404
