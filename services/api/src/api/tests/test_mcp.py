import time
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import uuid4

import httpx
import httpx2
import pytest
from api.app import app as bessel_app
from api.auth.dependencies import JWKSClient
from api.mcp.auth import Auth0TokenVerifier
from api.mcp.server import build_routes, build_server
from api.mcp.tools import TOOLS
from api.models.activity_event import ActivityEvent
from api.models.calendar import Calendar
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.calendar_event import CalendarEvent
from api.models.healthkit_sleep_sample import HealthKitSleepSample
from api.models.healthkit_workout import HealthKitWorkout
from api.models.recipe import Recipe
from api.models.task import Task
from api.models.user import User
from api.postgres import AsyncSession
from api.settings import settings
from api.tests.fixtures.base import OTHER_USER_INFO, TEST_USER_INFO
from api.tests.fixtures.database import SaveFixture
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwk, jwt
from mcp import Client
from mcp.client.streamable_http import streamable_http_client
from mcp.server.auth.provider import AccessToken
from mcp.types import CallToolResult
from pytest_mock import MockerFixture
from sqlalchemy import select
from starlette.applications import Starlette
from starlette.types import ASGIApp, Receive, Scope, Send

MCP_URL = settings.MCP_RESOURCE_URL
BASE_URL = MCP_URL.removesuffix("/mcp")
# Bearer tokens the fake verifier accepts, and the Auth0 user each one stands for.
TOKEN_SUBJECTS = {"token-a": TEST_USER_INFO.sub, "token-b": OTHER_USER_INFO.sub, "token-new": "auth0|first-mcp-login"}

ConnectFixture = Callable[..., AbstractAsyncContextManager[Client]]


async def _fake_verify_token(self: Auth0TokenVerifier, token: str) -> AccessToken | None:
  subject = TOKEN_SUBJECTS.get(token)
  if subject is None:
    return None
  return AccessToken(token=token, client_id="claude", scopes=[], resource=MCP_URL, subject=subject, claims={"iss": "test"})


ServeFixture = Callable[[], AbstractAsyncContextManager[ASGIApp]]


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


async def _call(connect: ConnectFixture, tool: str, arguments: dict[str, Any] | None = None, *, token: str = "token-a") -> dict[str, Any]:
  async with connect(token) as client:
    result = await client.call_tool(tool, arguments or {})
  assert not result.is_error, result.content
  assert result.structured_content is not None
  return result.structured_content


async def _call_error(connect: ConnectFixture, tool: str, arguments: dict[str, Any], *, token: str = "token-a") -> str:
  async with connect(token) as client:
    result: CallToolResult = await client.call_tool(tool, arguments)
  assert result.is_error
  return result.content[0].text.removeprefix(f"Error executing tool {tool}: ")  # type: ignore[union-attr]


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
  async def test_every_tool_is_read_only(self, connect: ConnectFixture) -> None:
    async with connect() as client:
      tools = (await client.list_tools()).tools
    assert len(tools) == len(TOOLS)
    for tool in tools:
      assert tool.annotations is not None
      assert tool.annotations.read_only_hint is True, tool.name
      assert tool.annotations.destructive_hint is False, tool.name

  @pytest.mark.asyncio
  async def test_exposes_no_money_or_investment_data(self, connect: ConnectFixture) -> None:
    async with connect() as client:
      names = {tool.name for tool in (await client.list_tools()).tools}
    assert not {n for n in names if any(word in n for word in ("transaction", "spending", "cash", "invest", "holding"))}

  @pytest.mark.asyncio
  async def test_first_call_creates_the_user(self, connect: ConnectFixture, session: AsyncSession) -> None:
    await _call(connect, "search_recipes", token="token-new")
    assert (await session.execute(select(User).where(User.auth0_sub == "auth0|first-mcp-login"))).scalar_one_or_none() is not None


class TestRecipes:
  @pytest.mark.asyncio
  async def test_search_and_get(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    pancakes = Recipe(title="Pancakes", content="- 2 eggs\n- 3 dl milk\n\n1. Whisk.")
    await save_owned(pancakes)
    await save_owned(Recipe(title="Lasagna", content="", recipe_type="main"))

    found = await _call(connect, "search_recipes", {"search": "pan"})
    assert found["total_count"] == 1
    assert found["recipes"] == [{"id": str(pancakes.id), "title": "Pancakes", "recipe_type": "other"}]

    recipe = await _call(connect, "get_recipe", {"recipe_id": str(pancakes.id)})
    assert recipe["title"] == "Pancakes"
    assert "2 eggs" in recipe["content"]

  @pytest.mark.asyncio
  async def test_other_user_cannot_see_recipes(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    recipe = Recipe(title="Secret sauce", content="")
    await save_owned(recipe)

    assert (await _call(connect, "search_recipes", token="token-b"))["recipes"] == []
    assert await _call_error(connect, "get_recipe", {"recipe_id": str(recipe.id)}, token="token-b") == "Recipe not found."


class TestTasks:
  @pytest.mark.asyncio
  async def test_filters_by_status_and_text(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    await save_owned(Task(title="Renew passport", description="Book a time", status="todo", area="Personal"))
    await save_owned(Task(title="File taxes", status="done", area="Personal"))

    todo = await _call(connect, "search_tasks", {"status": ["todo"]})
    assert [t["title"] for t in todo["tasks"]] == ["Renew passport"]
    assert (await _call(connect, "search_tasks", {"search": "book"}))["total_count"] == 1
    assert (await _call(connect, "search_tasks", {"area": "Work"}))["tasks"] == []

  @pytest.mark.asyncio
  async def test_other_user_cannot_see_tasks(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    task = Task(title="A's task", status="todo")
    await save_owned(task)

    assert (await _call(connect, "search_tasks", token="token-b"))["tasks"] == []
    assert await _call_error(connect, "get_task", {"task_id": str(task.id)}, token="token-b") == "Task not found."


class TestCalendar:
  @pytest.mark.asyncio
  async def test_events_in_local_days(self, connect: ConnectFixture, save_fixture: SaveFixture, user: User) -> None:
    account = CalendarAccount(user_id=user.id, provider=CalendarProvider.google, email="me@example.com", encrypted_credentials="unused")
    await save_fixture(account)
    calendar = Calendar(account_id=account.id, external_id="primary", name="Personal", color="#16a765")
    await save_fixture(calendar)
    # 23:30 UTC on Oct 4 is already Oct 5 in Stockholm.
    late = CalendarEvent(
      calendar_id=calendar.id,
      external_id="late",
      title="Dentist",
      all_day=False,
      start_at=datetime(2026, 10, 4, 23, 30, tzinfo=UTC),
      end_at=datetime(2026, 10, 5, 0, 30, tzinfo=UTC),
    )
    holiday = CalendarEvent(calendar_id=calendar.id, external_id="hol", title="Holiday", all_day=True, start_date=date(2026, 10, 5), end_date=date(2026, 10, 6))
    yesterday = CalendarEvent(calendar_id=calendar.id, external_id="old", title="Old", all_day=True, start_date=date(2026, 10, 4), end_date=date(2026, 10, 5))
    for event in (late, holiday, yesterday):
      await save_fixture(event)

    args = {"start_date": "2026-10-05", "end_date": "2026-10-05", "timezone": "Europe/Stockholm"}
    events = (await _call(connect, "get_calendar_events", args))["events"]
    assert [(e["title"], e["start"]) for e in events] == [("Holiday", "2026-10-05"), ("Dentist", "2026-10-04T23:30:00Z")]
    assert (await _call(connect, "get_calendar_events", args, token="token-b"))["events"] == []

  @pytest.mark.asyncio
  async def test_validates_range_and_timezone(self, connect: ConnectFixture) -> None:
    bad_tz = {"start_date": "2026-10-05", "end_date": "2026-10-05", "timezone": "Mars/Olympus"}
    assert await _call_error(connect, "get_calendar_events", bad_tz) == "Unknown timezone: Mars/Olympus"
    backwards = {"start_date": "2026-10-05", "end_date": "2026-10-01", "timezone": "UTC"}
    assert await _call_error(connect, "get_calendar_events", backwards) == "end_date must not be before start_date."
    too_long = {"start_date": "2026-01-01", "end_date": "2026-12-31", "timezone": "UTC"}
    assert await _call_error(connect, "get_calendar_events", too_long) == "The range can span at most 62 days."


class TestHealth:
  @pytest.mark.asyncio
  async def test_sleep_is_bucketed_by_wake_date(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    # 23:00 Oct 3 to 07:00 Oct 4, Stockholm (UTC+2).
    await save_owned(
      HealthKitSleepSample(
        healthkit_uuid=uuid4(),
        sleep_value=3,
        sleep_value_name="asleepCore",
        start_date=datetime(2026, 10, 3, 21, tzinfo=UTC),
        end_date=datetime(2026, 10, 4, 5, tzinfo=UTC),
        source_name="Apple Watch",
        source_bundle_id="com.apple.health",
      )
    )

    sleep = await _call(connect, "get_sleep", {"start_date": "2026-10-04", "end_date": "2026-10-04", "timezone": "Europe/Stockholm"})
    assert [(n["date"], n["asleep_secs"]) for n in sleep["nights"]] == [("2026-10-04", 8 * 3600)]
    assert sleep["total_asleep_secs"] == 8 * 3600
    assert (await _call(connect, "get_sleep", {"start_date": "2026-10-03", "end_date": "2026-10-03", "timezone": "Europe/Stockholm"}))["nights"] == []
    other = await _call(connect, "get_sleep", {"start_date": "2026-10-04", "end_date": "2026-10-04", "timezone": "Europe/Stockholm"}, token="token-b")
    assert other == {"nights": [], "total_asleep_secs": 0, "stages": []}

  @pytest.mark.asyncio
  async def test_workouts(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    start = datetime(2026, 10, 4, 7, tzinfo=UTC)
    await save_owned(
      HealthKitWorkout(
        healthkit_uuid=uuid4(),
        workout_activity_type=37,
        workout_activity_type_name="running",
        start_date=start,
        end_date=start + timedelta(minutes=30),
        duration=1800.0,
        total_distance=5000.0,
        source_name="Apple Watch",
        source_bundle_id="com.apple.health",
      )
    )

    workouts = (await _call(connect, "list_workouts"))["workouts"]
    assert [(w["type"], w["duration_secs"], w["distance_m"]) for w in workouts] == [("running", 1800.0, 5000.0)]
    assert (await _call(connect, "list_workouts", token="token-b"))["workouts"] == []


class TestComputerActivity:
  @pytest.mark.asyncio
  async def test_defaults_to_most_recent_source(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    start = int(datetime(2026, 10, 4, 8, tzinfo=UTC).timestamp())
    for i in range(3):
      await save_owned(ActivityEvent(local_id=i, ts=start + i * 60, state="active", app_class="kitty", title=None, workspace=None, source="laptop"))

    summary = await _call(connect, "get_computer_activity", {"start_date": "2026-10-04", "end_date": "2026-10-04", "timezone": "UTC"})
    assert summary["source"] == "laptop"
    assert summary["apps"][0]["app_class"] == "kitty"
    assert summary["total_active_secs"] > 0

    args = {"start_date": "2026-10-04", "end_date": "2026-10-04", "timezone": "UTC"}
    assert await _call_error(connect, "get_computer_activity", args, token="token-b") == "No computer activity has been recorded."
    theirs = await _call(connect, "get_computer_activity", {**args, "source": "laptop"}, token="token-b")
    assert (theirs["total_active_secs"], theirs["apps"], theirs["sources"]) == (0, [], [])

  @pytest.mark.asyncio
  async def test_no_activity_is_a_tool_error(self, connect: ConnectFixture) -> None:
    args = {"start_date": "2026-10-04", "end_date": "2026-10-04", "timezone": "UTC"}
    assert await _call_error(connect, "get_computer_activity", args) == "No computer activity has been recorded."


# Tools whose tests above check that a second user sees none of the first user's data.
ISOLATION_TESTED = {
  "get_calendar_events",
  "search_recipes",
  "get_recipe",
  "search_tasks",
  "get_task",
  "get_sleep",
  "list_workouts",
  "get_computer_activity",
}


def test_every_tool_has_an_isolation_test() -> None:
  assert {fn.__name__ for fn, _ in TOOLS} == ISOLATION_TESTED, "Add a cross-user test for the new tool and list it in ISOLATION_TESTED."
