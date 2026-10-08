import time
from typing import Any

import httpx
import pytest
from api.app import app as bessel_app
from api.auth.dependencies import JWKSClient
from api.mcp.auth import Auth0TokenVerifier
from api.mcp.tools import TOOLS
from api.models.user import User
from api.postgres import AsyncSession
from api.settings import settings
from api.tests.fixtures.mcp import ConnectFixture, ServeFixture, mcp_call
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwk, jwt
from pytest_mock import MockerFixture
from sqlalchemy import select

MCP_URL = settings.MCP_RESOURCE_URL
BASE_URL = MCP_URL.removesuffix("/mcp")


class TestTransport:
  @pytest.mark.asyncio
  async def test_unauthenticated_request_points_at_resource_metadata(self) -> None:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=bessel_app), base_url=BASE_URL) as client:
      resp = await client.post("/mcp", json={})
    assert resp.status_code == 401
    assert f'resource_metadata="{BASE_URL}/.well-known/oauth-protected-resource/mcp"' in resp.headers["www-authenticate"]

  @pytest.mark.asyncio
  async def test_resource_metadata_names_this_server_and_auth0(self) -> None:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=bessel_app), base_url=BASE_URL) as client:
      resp = await client.get("/.well-known/oauth-protected-resource/mcp")
    assert resp.status_code == 200
    assert resp.json()["resource"] == MCP_URL
    assert resp.json()["authorization_servers"] == [f"https://{settings.AUTH0_DOMAIN}/"]

  @pytest.mark.asyncio
  async def test_other_paths_keep_their_404_and_405(self) -> None:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=bessel_app), base_url=BASE_URL) as client:
      not_found = await client.get("/v1/does-not-exist")
      wrong_method = await client.delete("/v1/recipes")
    assert not_found.status_code == 404
    assert not_found.json() == {"detail": "Not Found"}
    assert wrong_method.status_code == 405

  def test_not_part_of_the_rest_api_schema(self) -> None:
    assert not any(path.startswith(("/mcp", "/.well-known")) for path in bessel_app.openapi()["paths"])

  @pytest.mark.asyncio
  async def test_rejects_unknown_host(self, serve: ServeFixture) -> None:
    async with serve() as app, httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://evil.example") as client:
      resp = await client.post(
        "/mcp",
        headers={"Authorization": "Bearer token-a", "Accept": "application/json, text/event-stream"},
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
      )
    assert resp.status_code == 421

  @pytest.mark.asyncio
  async def test_rejects_invalid_token(self, serve: ServeFixture) -> None:
    async with serve() as app, httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=BASE_URL) as client:
      resp = await client.post("/mcp", headers={"Authorization": "Bearer nope"}, json={})
    assert resp.status_code == 401


@pytest.fixture
def signing_key(mocker: MockerFixture) -> rsa.RSAPrivateKey:
  """An RSA key standing in for Auth0's, published through a patched JWKS."""
  key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
  public_pem = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
  jwks = {"keys": [{**jwk.construct(public_pem, "RS256").to_dict(), "kid": "test-kid"}]}
  mocker.patch.object(JWKSClient, "get_jwks", mocker.AsyncMock(return_value=jwks))
  mocker.patch.object(settings, "AUTH0_DOMAIN", "bessel-test.example.com")
  return key


def _token(key: rsa.RSAPrivateKey, **overrides: Any) -> str:
  now = int(time.time())
  claims = {
    "iss": f"https://{settings.AUTH0_DOMAIN}/",
    "sub": "auth0|someone",
    "aud": [MCP_URL, f"https://{settings.AUTH0_DOMAIN}/userinfo"],
    "azp": "dcr-client-id",
    "scope": "openid offline_access",
    "iat": now,
    "exp": now + 3600,
  } | overrides
  pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
  return jwt.encode(claims, pem, algorithm="RS256", headers={"kid": "test-kid"})


class TestTokenVerifier:
  @pytest.mark.asyncio
  async def test_accepts_token_issued_for_this_server(self, signing_key: rsa.RSAPrivateKey) -> None:
    access = await Auth0TokenVerifier().verify_token(_token(signing_key))
    assert access is not None
    assert access.subject == "auth0|someone"
    assert access.client_id == "dcr-client-id"
    assert access.resource == MCP_URL
    assert access.scopes == ["openid", "offline_access"]

  @pytest.mark.asyncio
  async def test_rejects_web_api_token(self, signing_key: rsa.RSAPrivateKey) -> None:
    assert await Auth0TokenVerifier().verify_token(_token(signing_key, aud=settings.AUTH0_AUDIENCE or "metron")) is None

  @pytest.mark.asyncio
  async def test_rejects_expired_token(self, signing_key: rsa.RSAPrivateKey) -> None:
    assert await Auth0TokenVerifier().verify_token(_token(signing_key, exp=int(time.time()) - 60)) is None

  @pytest.mark.asyncio
  async def test_rejects_other_issuer(self, signing_key: rsa.RSAPrivateKey) -> None:
    assert await Auth0TokenVerifier().verify_token(_token(signing_key, iss="https://attacker.example.com/")) is None

  @pytest.mark.asyncio
  async def test_rejects_token_signed_with_another_key(self, signing_key: rsa.RSAPrivateKey) -> None:
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    assert await Auth0TokenVerifier().verify_token(_token(other_key)) is None

  @pytest.mark.asyncio
  async def test_rejects_garbage(self, signing_key: rsa.RSAPrivateKey) -> None:
    assert await Auth0TokenVerifier().verify_token("not-a-jwt") is None


class TestTools:
  @pytest.mark.asyncio
  async def test_no_tool_deletes_and_reads_are_marked_read_only(self, connect: ConnectFixture) -> None:
    async with connect() as client:
      tools = (await client.list_tools()).tools
    assert len(tools) == len(TOOLS)
    writes = {"add_tasks", "update_tasks", "complete_tasks", "undo_complete_tasks", "start_task"}
    for tool in tools:
      assert tool.annotations is not None
      assert tool.annotations.destructive_hint is False, tool.name
      assert not any(word in tool.name for word in ("delete", "remove", "trash")), tool.name
      if tool.name not in writes and not tool.name.startswith("add_"):
        assert tool.annotations.read_only_hint is True, tool.name

  @pytest.mark.asyncio
  async def test_exposes_no_money_or_investment_data(self, connect: ConnectFixture) -> None:
    async with connect() as client:
      names = {tool.name for tool in (await client.list_tools()).tools}
    assert not {n for n in names if any(word in n for word in ("transaction", "spending", "cash", "invest", "holding"))}

  @pytest.mark.asyncio
  async def test_first_call_creates_the_user(self, connect: ConnectFixture, session: AsyncSession) -> None:
    await mcp_call(connect, "search_recipes", token="token-new")
    assert (await session.execute(select(User).where(User.auth0_sub == "auth0|first-mcp-login"))).scalar_one_or_none() is not None


# Tools whose tests above check that a second user sees none of the first user's data.
ISOLATION_TESTED = {
  "get_task_overview",
  "find_tasks",
  "find_completed_tasks",
  "get_task",
  "add_tasks",
  "update_tasks",
  "complete_tasks",
  "undo_complete_tasks",
  "start_task",
  "get_calendar_events",
  "search_recipes",
  "get_recipe",
  "add_recipe",
  "get_sleep",
  "list_workouts",
  "get_computer_activity",
}


def test_every_tool_has_an_isolation_test() -> None:
  assert {tool.fn.__name__ for tool in TOOLS} == ISOLATION_TESTED, "Add a cross-user test for the new tool and list it in ISOLATION_TESTED."
