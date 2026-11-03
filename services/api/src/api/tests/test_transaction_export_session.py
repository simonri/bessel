"""The exports stream after the request's session has committed: run them through the real session lifecycle.

Other tests swap `get_db_session` for the test session and leave out AsyncSessionMiddleware, so they can't show
that the session is still open while the body streams. Here both are the real ones, with sessions joining the test
transaction through savepoints so they see its rows and leave nothing behind.
"""

import csv
import io
import zipfile
from datetime import date
from typing import Any
from uuid import uuid4

import httpx
import pytest
from api.api import router as api_router
from api.auth.dependencies import verify_token
from api.models.bank_account import BankAccount
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.postgres import AsyncSession, AsyncSessionMiddleware
from api.tests.fixtures.base import _fake_verify_token
from api.tests.fixtures.database import SaveFixture
from api.transactions import export as export_module
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession as SQLAlchemyAsyncSession
from sqlalchemy.ext.asyncio import async_sessionmaker
from starlette.types import ASGIApp, Message, Receive, Scope, Send

DAYS = 7


class _RecordingSession(SQLAlchemyAsyncSession):
  events: list[str]

  async def commit(self) -> None:
    self.events.append("commit")
    await super().commit()

  async def stream(self, *args: Any, **kwargs: Any) -> Any:
    self.events.append("query")
    return await super().stream(*args, **kwargs)

  async def close(self) -> None:
    self.events.append("close")
    await super().close()


class _Lifespan:
  """What the app's lifespan puts in each request's state, recording what reaches the client."""

  def __init__(self, app: ASGIApp, sessionmaker: async_sessionmaker[_RecordingSession], events: list[str]) -> None:
    self.app = app
    self.sessionmaker = sessionmaker
    self.events = events

  async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
    scope["state"] = {"async_sessionmaker": self.sessionmaker}

    async def recording_send(message: Message) -> None:
      if message["type"] == "http.response.start":
        self.events.append("response")
      elif message["type"] == "http.response.body" and message.get("body"):
        self.events.append("body")
      await send(message)

    await self.app(scope, receive, recording_send)


async def _get(session: AsyncSession, path: str) -> tuple[httpx.Response, list[str]]:
  events: list[str] = []
  _RecordingSession.events = events
  sessionmaker = async_sessionmaker(bind=session.bind, class_=_RecordingSession, expire_on_commit=False, join_transaction_mode="create_savepoint")
  app = FastAPI()
  app.include_router(api_router)
  app.dependency_overrides[verify_token] = _fake_verify_token
  app.add_middleware(AsyncSessionMiddleware)
  app.add_middleware(_Lifespan, sessionmaker=sessionmaker, events=events)
  async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
    response = await client.get(path)
  return response, events


async def _month(save_fixture: SaveFixture, user: User) -> None:
  account = BankAccount(name="Lönekonto", currency="SEK", base_balance=0, subtype="checking", user_id=user.id)
  await save_fixture(account)
  for day in range(1, DAYS + 1):
    await save_fixture(
      Transaction(
        amount=1000 * day,
        currency="SEK",
        transaction_date=date(2026, 10, day),
        direction=TransactionDirection.debit,
        dedup_hash=uuid4().hex,
        description=f"Dag {day}",
        bank_account_id=account.id,
        user_id=user.id,
      )
    )


def _descriptions(content: bytes) -> list[str]:
  return [row[2] for row in list(csv.reader(io.StringIO(content.decode("utf-8-sig"), newline=""), delimiter=";"))[1:]]


class TestExportsStreamOnTheRequestSession:
  @pytest.mark.asyncio
  @pytest.mark.parametrize("path", ["/v1/transactions/export", "/v1/transactions/export/receipts"])
  async def test_every_chunk_is_read_after_the_commit_and_before_the_session_closes(
    self, session: AsyncSession, save_fixture: SaveFixture, user: User, monkeypatch: pytest.MonkeyPatch, path: str
  ) -> None:
    monkeypatch.setattr(export_module, "ROWS_PER_CHUNK", 2)
    await _month(save_fixture, user)

    response, events = await _get(session, path)

    assert response.status_code == 200, response.text
    content = response.content if path.endswith("/export") else zipfile.ZipFile(io.BytesIO(response.content)).read("transactions.csv")
    assert _descriptions(content) == [f"Dag {day}" for day in range(1, DAYS + 1)]
    # Committed before the response starts, read from only once it has, and closed only once the last chunk is out.
    assert events[:3] == ["commit", "response", "query"]
    assert events[-1] == "close" and "close" not in events[:-1]
    if path.endswith("/export"):
      assert events.count("body") >= DAYS // 2
