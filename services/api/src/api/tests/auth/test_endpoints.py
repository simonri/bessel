import pytest
from api.auth.dependencies import verify_token
from api.auth.schemas import UserInfo
from fastapi import FastAPI
from httpx import AsyncClient


class TestGetMe:
  @pytest.mark.asyncio
  async def test_authenticated(self, client: AsyncClient, app: FastAPI):
    # Mock the CurrentUser dependency to return a test user
    mock_user = UserInfo(sub="test-user-123", email="test@example.com", name="Test User")

    # Override the dependency
    app.dependency_overrides[verify_token] = lambda: mock_user

    try:
      response = await client.get("/v1/auth/me")

      assert response.status_code == 200
      data = response.json()
      assert data["sub"] == "test-user-123"
      assert data["email"] == "test@example.com"
      assert data["name"] == "Test User"
    finally:
      # Clean up
      app.dependency_overrides.pop(verify_token, None)

  @pytest.mark.asyncio
  async def test_unauthenticated(self, client: AsyncClient):
    # Without mocking the auth dependency, the request should fail
    # (assuming the default behavior is to require authentication)
    response = await client.get("/v1/auth/me")

    # Should return 401 or 403 depending on implementation
    assert response.status_code in (401, 403)
