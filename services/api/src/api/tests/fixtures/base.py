from collections.abc import AsyncGenerator, Callable, Coroutine
from typing import Any

import httpx
import pytest
import pytest_asyncio
from api.app import app as flow_app
from api.auth.dependencies import verify_token
from api.auth.schemas import UserInfo
from api.ingest_tokens.repository import IngestTokenRepository
from api.ingest_tokens.service import ingest_token_service
from api.models.user import User
from api.postgres import AsyncSession, get_db_session
from api.users.service import user_service
from fastapi import FastAPI, Request

TEST_USER_INFO = UserInfo(sub="auth0|test-user", email="test@example.com", name="Test User", picture=None)
OTHER_USER_INFO = UserInfo(sub="auth0|other-user", email="other@example.com", name="Other User", picture=None)
# Requests carrying this header authenticate as OTHER_USER_INFO instead of TEST_USER_INFO.
TEST_USER_HEADER = "x-test-user"


def _fake_verify_token(request: Request) -> UserInfo:
  return OTHER_USER_INFO if request.headers.get(TEST_USER_HEADER) == "other" else TEST_USER_INFO


class IsolatedSessionTestClient(httpx.AsyncClient):
  """
  Test client that mimics production behavior by clearing session before requests.

  In production, each HTTP request gets a fresh database session. This client
  simulates that by expunging all objects from the test session before each
  request, catching lazy='raise' errors that would otherwise pass in tests.

  Disable for specific tests with @pytest.mark.keep_session_state marker.
  """

  def __init__(self, session: AsyncSession, auto_expunge: bool, *args: Any, **kwargs: Any):
    super().__init__(*args, **kwargs)
    self._session = session
    self._auto_expunge = auto_expunge

  async def request(self, *args: Any, **kwargs: Any) -> httpx.Response:
    """Expunge session before each request to simulate production."""
    if self._auto_expunge:
      self._session.expunge_all()
    return await super().request(*args, **kwargs)


@pytest_asyncio.fixture
async def app(session: AsyncSession) -> AsyncGenerator[FastAPI]:
  flow_app.dependency_overrides[get_db_session] = lambda: session
  flow_app.dependency_overrides[verify_token] = _fake_verify_token

  yield flow_app

  flow_app.dependency_overrides.pop(get_db_session)
  flow_app.dependency_overrides.pop(verify_token)


@pytest_asyncio.fixture
async def client(app: FastAPI, session: AsyncSession, request: pytest.FixtureRequest) -> AsyncGenerator[httpx.AsyncClient, None]:
  # Check if test wants to keep session state (opt-out)
  keep_state = request.node.get_closest_marker("keep_session_state") is not None
  auto_expunge = not keep_state

  async with IsolatedSessionTestClient(
    session=session,
    auto_expunge=auto_expunge,
    transport=httpx.ASGITransport(app=app),
    base_url="http://test",
  ) as client:
    yield client


@pytest_asyncio.fixture
async def other_client(app: FastAPI, session: AsyncSession, request: pytest.FixtureRequest) -> AsyncGenerator[httpx.AsyncClient, None]:
  """Like `client`, but authenticated as a second, unrelated user."""
  keep_state = request.node.get_closest_marker("keep_session_state") is not None
  async with IsolatedSessionTestClient(
    session=session,
    auto_expunge=not keep_state,
    transport=httpx.ASGITransport(app=app),
    base_url="http://test",
    headers={TEST_USER_HEADER: "other"},
  ) as client:
    yield client


@pytest_asyncio.fixture
async def user(session: AsyncSession) -> User:
  return await user_service.get_or_create_by_sub(session, TEST_USER_INFO.sub, TEST_USER_INFO.email)


@pytest_asyncio.fixture
async def other_user(session: AsyncSession) -> User:
  return await user_service.get_or_create_by_sub(session, OTHER_USER_INFO.sub, OTHER_USER_INFO.email)


async def _ingest_headers_for(session: AsyncSession, owner: User) -> dict[str, str]:
  _, token = await ingest_token_service.create(IngestTokenRepository.from_session(session), owner.id, "test-daemon")
  return {"X-Api-Key": token}


@pytest_asyncio.fixture
async def ingest_headers(session: AsyncSession, user: User) -> dict[str, str]:
  """X-Api-Key header carrying an ingest token owned by `user`."""
  return await _ingest_headers_for(session, user)


@pytest_asyncio.fixture
async def other_ingest_headers(session: AsyncSession, other_user: User) -> dict[str, str]:
  return await _ingest_headers_for(session, other_user)


@pytest_asyncio.fixture
async def save_owned(session: AsyncSession, user: User) -> Callable[[Any], Coroutine[None, None, None]]:
  """Persist a user-owned model as belonging to `user`."""

  async def _save(model: Any) -> None:
    model.user_id = user.id
    session.add(model)
    await session.flush()

  return _save
