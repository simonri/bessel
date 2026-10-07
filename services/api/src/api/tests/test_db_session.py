from collections.abc import Iterator

import httpx
import pytest
from api.app import app as api_app
from api.postgres import DBSession, get_db_session
from fastapi import FastAPI
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute, iter_route_contexts
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class SpySession:
  def __init__(self, events: list[str], *, fail_commit: bool = False) -> None:
    self.events = events
    self.fail_commit = fail_commit

  async def commit(self) -> None:
    self.events.append("commit")
    if self.fail_commit:
      raise RuntimeError("commit failed")

  async def rollback(self) -> None:
    self.events.append("rollback")


class SpyMiddleware:
  """Stands in for AsyncSessionMiddleware and records which response the app sends.

  Unhandled errors become a 500 outside of it, in ServerErrorMiddleware.
  """

  def __init__(self, app: ASGIApp, session: SpySession) -> None:
    self.app = app
    self.session = session

  async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
    scope.setdefault("state", {})["async_session"] = self.session

    async def recording_send(message: Message) -> None:
      if message["type"] == "http.response.start":
        self.session.events.append(f"response {message['status']}")
      await send(message)

    await self.app(scope, receive, recording_send)


def _app(session: SpySession) -> FastAPI:
  app = FastAPI()
  app.add_middleware(SpyMiddleware, session=session)

  @app.post("/write")
  async def write(session: DBSession) -> dict[str, bool]:
    return {"ok": True}

  @app.post("/fail")
  async def fail(session: DBSession) -> None:
    raise ValueError("boom")

  return app


async def _post(session: SpySession, path: str) -> httpx.Response:
  transport = httpx.ASGITransport(app=_app(session), raise_app_exceptions=False)
  async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
    return await client.post(path)


def _session_dependants(dependant: Dependant) -> Iterator[Dependant]:
  for sub in dependant.dependencies:
    if sub.call is get_db_session:
      yield sub
    yield from _session_dependants(sub)


class TestDBSession:
  @pytest.mark.asyncio
  async def test_commits_before_the_response_is_sent(self) -> None:
    events: list[str] = []
    response = await _post(SpySession(events), "/write")
    assert response.status_code == 200
    assert events == ["commit", "response 200"]

  @pytest.mark.asyncio
  async def test_failed_commit_is_a_server_error(self) -> None:
    events: list[str] = []
    response = await _post(SpySession(events, fail_commit=True), "/write")
    assert response.status_code == 500
    assert events == ["commit"]

  @pytest.mark.asyncio
  async def test_endpoint_error_rolls_back(self) -> None:
    events: list[str] = []
    response = await _post(SpySession(events), "/fail")
    assert response.status_code == 500
    assert events == ["rollback"]

  def test_every_route_commits_before_responding(self) -> None:
    routes = [route for route in iter_route_contexts(api_app.routes) if isinstance(route.original_route, APIRoute)]
    late = {
      f"{sorted(route.methods or ())} {route.path}" for route in routes for dependant in _session_dependants(route.dependant) if dependant.scope != "function"
    }
    assert routes and not late, f"Use DBSession instead of Depends(get_db_session) on: {sorted(late)}"
