"""Running the MCP server in tests: a fake token verifier, the routes on their
own, and SDK clients connected to them."""

from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from typing import Any

import httpx2
import pytest
from api.mcp.auth import Auth0TokenVerifier
from api.mcp.server import build_routes, build_server
from api.postgres import AsyncSession
from api.settings import settings
from api.tests.fixtures.base import OTHER_USER_INFO, TEST_USER_INFO
from mcp import Client
from mcp.client.streamable_http import streamable_http_client
from mcp.server.auth.provider import AccessToken
from mcp.types import CallToolResult
from pytest_mock import MockerFixture
from starlette.applications import Starlette
from starlette.types import ASGIApp, Receive, Scope, Send

MCP_URL = settings.MCP_RESOURCE_URL
# Bearer tokens the fake verifier accepts, and the Auth0 user each one stands for.
MCP_TOKEN_SUBJECTS = {"token-a": TEST_USER_INFO.sub, "token-b": OTHER_USER_INFO.sub, "token-new": "auth0|first-mcp-login"}

ServeFixture = Callable[[], AbstractAsyncContextManager[ASGIApp]]
ConnectFixture = Callable[..., AbstractAsyncContextManager[Client]]


async def _fake_verify_token(self: Auth0TokenVerifier, token: str) -> AccessToken | None:
  subject = MCP_TOKEN_SUBJECTS.get(token)
  if subject is None:
    return None
  return AccessToken(token=token, client_id="claude", scopes=[], resource=MCP_URL, subject=subject, claims={"iss": "test"})


@pytest.fixture
def serve(session: AsyncSession, mocker: MockerFixture) -> ServeFixture:
  """Runs the MCP routes on their own, with the test session standing in for AsyncSessionMiddleware's.

  The session manager's task group must be entered and exited in the same
  task, so it runs inside each test rather than in an async fixture.
  """
  mocker.patch.object(Auth0TokenVerifier, "verify_token", _fake_verify_token)

  @asynccontextmanager
  async def _serve() -> AsyncIterator[ASGIApp]:
    server = build_server()
    routes_app = Starlette(routes=build_routes(server))

    async def app(scope: Scope, receive: Receive, send: Send) -> None:
      if scope["type"] == "http":
        scope.setdefault("state", {})["async_session"] = session
      await routes_app(scope, receive, send)

    async with server.session_manager.run():
      yield app

  return _serve


@pytest.fixture(params=["auto", "legacy"])
def connect(serve: ServeFixture, request: pytest.FixtureRequest) -> ConnectFixture:
  """Connects an SDK client, once per protocol path: the current per-request one and the legacy initialize handshake."""

  @asynccontextmanager
  async def _connect(token: str = "token-a") -> AsyncIterator[Client]:
    async with serve() as app:
      http_client = httpx2.AsyncClient(transport=httpx2.ASGITransport(app=app), headers={"Authorization": f"Bearer {token}"})
      async with Client(streamable_http_client(MCP_URL, http_client=http_client), mode=request.param) as client:
        yield client

  return _connect


async def mcp_call(connect: ConnectFixture, tool: str, arguments: dict[str, Any] | None = None, *, token: str = "token-a") -> dict[str, Any]:
  """Calls `tool` and returns its structured result, failing the test on a tool error."""
  async with connect(token) as client:
    result = await client.call_tool(tool, arguments or {})
  assert not result.is_error, result.content
  assert result.structured_content is not None
  return result.structured_content


async def mcp_call_error(connect: ConnectFixture, tool: str, arguments: dict[str, Any], *, token: str = "token-a") -> str:
  """Calls `tool`, expecting a tool error, and returns its message."""
  async with connect(token) as client:
    result: CallToolResult = await client.call_tool(tool, arguments)
  assert result.is_error
  return result.content[0].text.removeprefix(f"Error executing tool {tool}: ")  # type: ignore[union-attr]
