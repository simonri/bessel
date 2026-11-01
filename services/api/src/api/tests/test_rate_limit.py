from typing import Any

import pytest
from api.mcp.auth import Auth0TokenVerifier
from api.rate_limit import _authenticate
from mcp.server.auth.provider import AccessToken
from pytest_mock import MockerFixture

USERS = {"token-a": "auth0|a", "token-a-refreshed": "auth0|a", "token-b": "auth0|b"}


def scope(path: str, *, authorization: str | None = None, ip: str = "160.79.104.10") -> dict[str, Any]:
  headers = [(b"x-real-ip", ip.encode())]
  if authorization:
    headers.append((b"authorization", authorization.encode()))
  return {"type": "http", "path": path, "headers": headers, "client": ("10.0.0.2", 1234)}


@pytest.fixture(autouse=True)
def _tokens(mocker: MockerFixture) -> None:
  async def verify(self: Auth0TokenVerifier, token: str) -> AccessToken | None:
    sub = USERS.get(token)
    return AccessToken(token=token, client_id="claude", scopes=[], subject=sub) if sub else None

  mocker.patch.object(Auth0TokenVerifier, "verify_token", verify)


async def key(path: str, authorization: str | None = None) -> str:
  return (await _authenticate(scope(path, authorization=authorization)))[0]


class TestRateLimitKey:
  @pytest.mark.asyncio
  async def test_mcp_calls_from_one_address_count_per_user(self) -> None:
    # Every Claude user's calls come from Anthropic's addresses.
    a = await key("/mcp", "Bearer token-a")
    assert a != await key("/mcp", "Bearer token-b")
    assert a == await key("/mcp", "bearer token-a-refreshed")
    assert "auth0" not in a

  @pytest.mark.asyncio
  async def test_made_up_tokens_count_against_the_address(self) -> None:
    # Otherwise a fresh random token per request would get a fresh budget each time.
    assert await key("/mcp", "Bearer made-up-1") == "160.79.104.10"
    assert await key("/mcp", "Bearer made-up-2") == "160.79.104.10"

  @pytest.mark.asyncio
  async def test_mcp_calls_without_a_token_and_the_rest_api_count_per_address(self) -> None:
    assert await key("/mcp") == "160.79.104.10"
    assert await key("/v1/tasks", "Bearer token-a") == "160.79.104.10"
