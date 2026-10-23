import base64
import hashlib
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qs, urlparse
from uuid import UUID

import httpx
import pytest
from api.common.encryption import decrypt, encrypt
from api.models.bank_account import BankAccount
from api.models.montrose import MontroseAccount, MontroseConnection
from api.models.security import AssetType, Security
from api.models.trade import Trade, TradeType
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.montrose import client as montrose_client
from api.montrose import service
from api.montrose.client import MontroseAuthError
from api.montrose.repository import MontroseConnectionRepository
from api.montrose.service import REJECTED, UNREACHABLE, SessionMaker, montrose_service
from api.postgres import AsyncSession
from api.settings import settings
from api.tests.fixtures.database import SaveFixture
from api.worker._enqueue import JobQueueManager
from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy import func, select

NOW = datetime(2026, 10, 23, 8, 0, tzinfo=UTC)
ISK = {"accountId": "3fa85f64-5717-4562-b3fc-2c963f66afa6", "accountNumber": "1234-567", "accountName": "Mitt ISK", "accountType": "ISK", "credit": None}
KF = {"accountId": "9b2c1d4e-0000-4000-8000-000000000001", "accountNumber": "7654-321", "accountName": "Pension", "accountType": "KF", "credit": None}


@dataclass
class FakeMontrose:
  """Montrose's OAuth and MCP endpoints, as far as Bessel uses them."""

  accounts: list[dict[str, Any]] = field(default_factory=lambda: [ISK])
  clients: dict[str, dict[str, Any]] = field(default_factory=dict)
  codes: dict[str, str] = field(default_factory=dict)
  access_token: str = ""
  refresh_token: str = ""
  issued: int = 0
  refreshes: int = 0
  reject_refresh: bool = False
  # Montrose's reported bug: the refresh succeeds, then the new access token is turned away.
  reject_new_tokens: bool = False
  answer_as_event_stream: bool = False
  fail_with: int | None = None
  tool_calls: list[str] = field(default_factory=list)
  transactions: list[dict[str, Any]] = field(default_factory=list)
  holdings: list[dict[str, Any]] = field(default_factory=list)
  instruments: dict[int, dict[str, Any]] = field(default_factory=dict)
  # Montrose pages transactions; a smaller page here makes the paging show.
  page_size: int = 2
  transaction_requests: list[dict[str, Any]] = field(default_factory=list)

  def transport(self) -> httpx.MockTransport:
    return httpx.MockTransport(self._handle)

  def approve(self, authorize_url: str) -> str:
    """What the user's BankID login does: Montrose remembers the challenge and hands back a code."""
    query = parse_qs(urlparse(authorize_url).query)
    code = f"code-{len(self.codes)}"
    self.codes[code] = query["code_challenge"][0]
    return code

  def _issue(self) -> dict[str, Any]:
    self.issued += 1
    self.access_token, self.refresh_token = f"access-{self.issued}", f"refresh-{self.issued}"
    return {"access_token": self.access_token, "refresh_token": self.refresh_token, "token_type": "bearer", "expires_in": 900, "scope": "mcp"}

  def _handle(self, request: httpx.Request) -> httpx.Response:
    if request.url.path == "/register":
      body = json.loads(request.content)
      client_id = f"client-{len(self.clients)}"
      self.clients[client_id] = {"secret": f"secret-{len(self.clients)}", "redirect_uris": body["redirect_uris"]}
      return httpx.Response(201, json={"client_id": client_id, "client_secret": self.clients[client_id]["secret"]})
    if request.url.path == "/token":
      form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
      registered = self.clients.get(form["client_id"])
      if registered is None or registered["secret"] != form.get("client_secret") or form.get("resource") != montrose_client.RESOURCE:
        return httpx.Response(401, json={"error": "invalid_client"})
      if form["grant_type"] == "authorization_code":
        challenge = self.codes.pop(form["code"], None)
        verified = base64.urlsafe_b64encode(hashlib.sha256(form["code_verifier"].encode()).digest()).rstrip(b"=").decode()
        if challenge is None or challenge != verified or form["redirect_uri"] not in registered["redirect_uris"]:
          return httpx.Response(400, json={"error": "invalid_grant"})
        return httpx.Response(200, json=self._issue())
      if self.reject_refresh or form["refresh_token"] != self.refresh_token:
        return httpx.Response(400, json={"error": "invalid_grant"})
      self.refreshes += 1
      tokens = self._issue()
      if self.reject_new_tokens:
        self.access_token = "nothing-works"
      return httpx.Response(200, json=tokens)
    if request.headers.get("Authorization") != f"Bearer {self.access_token}":
      return httpx.Response(401, json={"error": "invalid_token"})
    if self.fail_with:
      return httpx.Response(self.fail_with, text="account 1234-567 is unavailable")
    message = json.loads(request.content)
    if "id" not in message:
      return httpx.Response(202)
    if message["method"] == "initialize":
      return self._reply(message, {"protocolVersion": "2025-06-18", "capabilities": {"tools": {}}}, headers={"Mcp-Session-Id": "s-1"})
    if request.headers.get("Mcp-Session-Id") != "s-1":
      return httpx.Response(400, json={"error": "no session"})
    name = message["params"]["name"]
    self.tool_calls.append(name)
    arguments = message["params"].get("arguments") or {}
    if name == "get_user_accounts":
      return self._reply(message, {"content": [{"type": "text", "text": json.dumps(self.accounts)}], "structuredContent": {"result": self.accounts}})
    if name == "get_transactions":
      self.transaction_requests.append(arguments)
      rows = [
        t for t in self.transactions if t["accountId"] in (arguments.get("accountIds") or [t["accountId"]]) and t["tradeDate"] >= (arguments.get("from") or "")
      ]
      start = int(arguments.get("cursor") or 0)
      size = min(arguments.get("pageSize") or 50, self.page_size)
      more = start + size < len(rows)
      page = {"transactions": rows[start : start + size], "pagination": {"nextCursor": str(start + size) if more else None, "totalCount": len(rows)}}
      # No output schema for this tool: Montrose answers with JSON as text only.
      return self._reply(message, {"content": [{"type": "text", "text": json.dumps(page)}]})
    if name == "get_holdings":
      return self._reply(message, {"content": [{"type": "text", "text": json.dumps(self.holdings)}], "structuredContent": {"result": self.holdings}})
    if name == "search_instruments":
      found = [self.instruments[arguments["orderbookId"]]] if arguments.get("orderbookId") in self.instruments else []
      return self._reply(message, {"content": [{"type": "text", "text": json.dumps(found)}], "structuredContent": {"result": found}})
    return self._reply(message, {"content": [{"type": "text", "text": "unknown tool"}], "isError": True})

  def _reply(self, message: dict[str, Any], result: dict[str, Any], headers: dict[str, str] | None = None) -> httpx.Response:
    body = {"jsonrpc": "2.0", "id": message["id"], "result": result}
    if self.answer_as_event_stream:
      return httpx.Response(200, text=f"event: message\ndata: {json.dumps(body)}\n\n", headers={"Content-Type": "text/event-stream", **(headers or {})})
    return httpx.Response(200, json=body, headers=headers)


@pytest.fixture(autouse=True)
def encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())


@pytest.fixture(autouse=True)
def frozen_now(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(service, "utc_now", lambda: NOW)
  monkeypatch.setattr("api.montrose.endpoints.utc_now", lambda: NOW)


@pytest.fixture
def montrose(monkeypatch: pytest.MonkeyPatch) -> FakeMontrose:
  fake = FakeMontrose()
  monkeypatch.setattr(montrose_client, "http_client", lambda: httpx.AsyncClient(base_url=montrose_client.BASE_URL, transport=fake.transport()))
  return fake


@pytest.fixture
def session_maker(session: AsyncSession) -> SessionMaker:
  @asynccontextmanager
  async def maker() -> AsyncIterator[AsyncSession]:
    yield session
    await session.flush()

  return maker


async def _connect(client: AsyncClient, montrose: FakeMontrose) -> dict[str, Any]:
  url = (await client.post("/v1/montrose/authorize")).json()["url"]
  state = parse_qs(urlparse(url).query)["state"][0]
  response = await client.post("/v1/montrose/callback", json={"code": montrose.approve(url), "state": state, "iss": montrose_client.BASE_URL})
  assert response.status_code == 201, response.text
  return response.json()


async def _stored(session: AsyncSession, user: User) -> MontroseConnection:
  connection = await MontroseConnectionRepository.from_session(session).get_for_user(user.id)
  assert connection is not None
  await session.refresh(connection)
  return connection


async def _bank_account(save_fixture: SaveFixture, user: User, name: str = "Montrose ISK") -> BankAccount:
  bank_account = BankAccount(name=name, currency="SEK", base_balance=0, subtype="isk", user_id=user.id)
  await save_fixture(bank_account)
  return bank_account


class TestConnecting:
  @pytest.mark.asyncio
  async def test_the_bankid_login_comes_back_to_bessel_and_the_tokens_are_kept_encrypted(
    self, client: AsyncClient, session: AsyncSession, montrose: FakeMontrose, user: User
  ) -> None:
    url = (await client.post("/v1/montrose/authorize")).json()["url"]
    query = parse_qs(urlparse(url).query)

    assert url.startswith("https://mcp.montrose.io/authorize?")
    assert (query["redirect_uri"][0], query["code_challenge_method"][0], query["resource"][0]) == (
      settings.generate_frontend_url("montrose/callback"),
      "S256",
      "https://mcp.montrose.io",
    )
    assert "verifier" not in url and "secret" not in url

    montrose.accounts = [ISK, KF]
    connected = await client.post("/v1/montrose/callback", json={"code": montrose.approve(url), "state": query["state"][0], "iss": "https://mcp.montrose.io"})

    assert connected.status_code == 201
    body = connected.json()
    assert [(a["name"], a["account_type"], a["account_number"], a["bank_account_id"]) for a in body["accounts"]] == [
      ("Mitt ISK", "ISK", "1234-567", None),
      ("Pension", "KF", "7654-321", None),
    ]
    assert body["consent_expires_at"] == (NOW + timedelta(days=90)).isoformat().replace("+00:00", "Z")
    stored = await _stored(session, user)
    assert "access-1" not in stored.encrypted_tokens and "secret-0" not in stored.encrypted_client
    assert json.loads(decrypt(stored.encrypted_tokens)) == {"access_token": "access-1", "refresh_token": "refresh-1"}
    assert stored.access_expires_at == NOW + timedelta(seconds=900)

  @pytest.mark.asyncio
  async def test_a_login_started_by_someone_else_late_or_from_another_issuer_is_refused(
    self, client: AsyncClient, session: AsyncSession, montrose: FakeMontrose, user: User, monkeypatch: pytest.MonkeyPatch
  ) -> None:
    url = (await client.post("/v1/montrose/authorize")).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    payload = json.loads(decrypt(state))
    someone_else = encrypt(json.dumps({**payload, "user_id": "00000000-0000-4000-8000-000000000000"}))

    other_user = await client.post("/v1/montrose/callback", json={"code": montrose.approve(url), "state": someone_else})
    wrong_issuer = await client.post("/v1/montrose/callback", json={"code": montrose.approve(url), "state": state, "iss": "https://evil.example"})
    monkeypatch.setattr(service, "STATE_TTL_SECONDS", -1)
    too_late = await client.post("/v1/montrose/callback", json={"code": montrose.approve(url), "state": state})

    assert [r.status_code for r in (other_user, wrong_issuer, too_late)] == [400, 400, 400]
    assert too_late.json()["detail"] == "The Montrose login expired. Start again from Bessel."
    assert await MontroseConnectionRepository.from_session(session).get_for_user(user.id) is None

  @pytest.mark.asyncio
  async def test_a_code_montrose_doesnt_accept_stores_nothing(self, client: AsyncClient, session: AsyncSession, montrose: FakeMontrose, user: User) -> None:
    url = (await client.post("/v1/montrose/authorize")).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]

    response = await client.post("/v1/montrose/callback", json={"code": "made-up", "state": state})

    assert (response.status_code, response.json()["detail"]) == (400, "Montrose didn't accept the login. Start again from Bessel.")
    assert await MontroseConnectionRepository.from_session(session).get_for_user(user.id) is None

  @pytest.mark.asyncio
  async def test_logging_in_again_keeps_the_links_and_resumes_a_rejected_connection(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, montrose: FakeMontrose, user: User, job_queue_manager: JobQueueManager
  ) -> None:
    first = await _connect(client, montrose)
    bank_account = await _bank_account(save_fixture, user)
    await client.patch(f"/v1/montrose/accounts/{first['accounts'][0]['id']}", json={"bank_account_id": str(bank_account.id)})
    stored = await _stored(session, user)
    stored.rejected_at, stored.sync_error = NOW, REJECTED
    await session.flush()
    job_queue_manager._enqueued_jobs.clear()

    again = await _connect(client, montrose)

    assert (again["id"], again["rejected"], again["sync_error"]) == (first["id"], False, None)
    assert again["accounts"][0]["bank_account_id"] == str(bank_account.id)
    assert [job[:2] for job in job_queue_manager._enqueued_jobs] == [("sync_montrose_connection", (first["id"],))]


class TestAccountNames:
  @pytest.mark.asyncio
  async def test_an_account_montrose_leaves_unnamed_is_named_after_its_type(self, client: AsyncClient, montrose: FakeMontrose) -> None:
    montrose.accounts = [
      {**ISK, "accountName": ""},
      {**KF, "accountName": "  "},
      {**ISK, "accountId": "d", "accountType": "Depot", "accountName": None},
      {**ISK, "accountId": "x", "accountType": "Margin", "accountName": ""},
      {**ISK, "accountId": "n", "accountName": "Barnens ISK"},
    ]

    connected = await _connect(client, montrose)
    status = (await client.get("/v1/montrose")).json()

    assert [a["name"] for a in connected["accounts"]] == ["Montrose - ISK", "Montrose - KF", "Montrose - Depå", "Montrose - Margin", "Barnens ISK"]
    assert status["logo"] == service.LOGO


class TestAccessToken:
  @pytest.mark.asyncio
  async def test_a_fresh_token_is_used_as_is_and_an_old_one_is_refreshed_and_saved_with_its_new_refresh_token(
    self, client: AsyncClient, session: AsyncSession, session_maker: SessionMaker, montrose: FakeMontrose, user: User
  ) -> None:
    connection_id = UUID((await _connect(client, montrose))["id"])

    fresh = await montrose_service.access_token(session_maker, connection_id, now=NOW + timedelta(minutes=13))
    refreshed = await montrose_service.access_token(session_maker, connection_id, now=NOW + timedelta(minutes=14, seconds=30))
    again = await montrose_service.access_token(session_maker, connection_id, now=NOW + timedelta(minutes=30))

    assert (fresh, refreshed, again) == ("access-1", "access-2", "access-3")
    assert montrose.refreshes == 2
    stored = await _stored(session, user)
    assert json.loads(decrypt(stored.encrypted_tokens))["refresh_token"] == "refresh-3"
    assert stored.access_expires_at == NOW + timedelta(minutes=30, seconds=900)

  @pytest.mark.asyncio
  async def test_a_refresh_montrose_turns_down_stops_syncing_until_the_next_bankid_login(
    self, client: AsyncClient, session: AsyncSession, session_maker: SessionMaker, montrose: FakeMontrose, user: User
  ) -> None:
    connection_id = UUID((await _connect(client, montrose))["id"])
    montrose.reject_refresh = True

    with pytest.raises(MontroseAuthError):
      await montrose_service.access_token(session_maker, connection_id, now=NOW + timedelta(hours=1))

    stored = await _stored(session, user)
    assert (stored.rejected_at, stored.sync_error) == (NOW + timedelta(hours=1), REJECTED)
    assert connection_id not in await MontroseConnectionRepository.from_session(session).list_syncable_ids()
    assert (await client.post("/v1/montrose/sync")).status_code == 400


class TestSync:
  @pytest.mark.asyncio
  async def test_a_sync_refreshes_the_consent_and_keeps_the_account_list_current(
    self, client: AsyncClient, session: AsyncSession, session_maker: SessionMaker, montrose: FakeMontrose, user: User, monkeypatch: pytest.MonkeyPatch
  ) -> None:
    connection_id = UUID((await _connect(client, montrose))["id"])
    later = NOW + timedelta(hours=10)
    monkeypatch.setattr(service, "utc_now", lambda: later)
    montrose.accounts = [{**ISK, "accountName": "ISK - aktier"}, KF]
    montrose.answer_as_event_stream = True

    await montrose_service.sync(session_maker, connection_id)

    stored = await _stored(session, user)
    await session.refresh(stored, ["accounts"])
    assert [(a.name, a.account_type) for a in stored.accounts] == [("ISK - aktier", "ISK"), ("Pension", "KF")]
    assert (stored.last_synced_at, stored.sync_error, stored.rejected_at, montrose.refreshes) == (later, None, None, 1)

  @pytest.mark.asyncio
  async def test_an_outage_is_reported_without_ending_the_consent_or_leaking_details(
    self, client: AsyncClient, session: AsyncSession, session_maker: SessionMaker, montrose: FakeMontrose, user: User
  ) -> None:
    connection_id = UUID((await _connect(client, montrose))["id"])
    montrose.fail_with = 503

    await montrose_service.sync(session_maker, connection_id)

    stored = await _stored(session, user)
    assert (stored.sync_error, stored.rejected_at, stored.last_synced_at) == (UNREACHABLE, None, None)

  @pytest.mark.asyncio
  async def test_a_refreshed_token_montrose_turns_away_ends_the_consent(
    self, client: AsyncClient, session: AsyncSession, session_maker: SessionMaker, montrose: FakeMontrose, user: User, monkeypatch: pytest.MonkeyPatch
  ) -> None:
    connection_id = UUID((await _connect(client, montrose))["id"])
    monkeypatch.setattr(service, "utc_now", lambda: NOW + timedelta(days=1))
    montrose.reject_new_tokens = True

    await montrose_service.sync(session_maker, connection_id)

    stored = await _stored(session, user)
    assert (stored.sync_error, stored.rejected_at) == (REJECTED, NOW + timedelta(days=1))


class TestAccounts:
  @pytest.mark.asyncio
  async def test_linking_queues_an_import_and_one_bessel_account_takes_one_montrose_account(
    self, client: AsyncClient, save_fixture: SaveFixture, montrose: FakeMontrose, user: User, job_queue_manager: JobQueueManager
  ) -> None:
    montrose.accounts = [ISK, KF]
    connected = await _connect(client, montrose)
    isk, kf = connected["accounts"]
    bank_account = await _bank_account(save_fixture, user)

    linked = await client.patch(f"/v1/montrose/accounts/{isk['id']}", json={"bank_account_id": str(bank_account.id)})
    taken = await client.patch(f"/v1/montrose/accounts/{kf['id']}", json={"bank_account_id": str(bank_account.id)})
    unlinked = await client.patch(f"/v1/montrose/accounts/{isk['id']}", json={"bank_account_id": None})

    assert linked.json()["accounts"][0]["bank_account_id"] == str(bank_account.id)
    assert (taken.status_code, taken.json()["detail"]) == (409, "That Bessel account already imports another Montrose account.")
    assert unlinked.json()["accounts"][0]["bank_account_id"] is None
    assert [job[:2] for job in job_queue_manager._enqueued_jobs] == [("sync_montrose_connection", (connected["id"],))]

  @pytest.mark.asyncio
  async def test_sync_now_waits_a_moment_after_the_last_sync_and_disconnecting_forgets_the_tokens(
    self, client: AsyncClient, session: AsyncSession, montrose: FakeMontrose, user: User, job_queue_manager: JobQueueManager
  ) -> None:
    await _connect(client, montrose)
    stored = await _stored(session, user)
    stored.last_synced_at = NOW - timedelta(minutes=1)
    await session.flush()

    too_soon = await client.post("/v1/montrose/sync")
    stored = await _stored(session, user)
    stored.last_synced_at = NOW - timedelta(minutes=3)
    await session.flush()
    allowed = await client.post("/v1/montrose/sync")
    disconnected = await client.delete("/v1/montrose")

    assert (too_soon.status_code, allowed.status_code, disconnected.status_code) == (429, 202, 204)
    assert (await client.get("/v1/montrose")).json()["connection"] is None
    assert (await session.execute(select(func.count()).select_from(MontroseAccount))).scalar_one() == 0


class TestIsolation:
  @pytest.mark.asyncio
  async def test_other_users_cant_finish_see_link_sync_or_disconnect(self, client: AsyncClient, other_client: AsyncClient, montrose: FakeMontrose) -> None:
    url = (await client.post("/v1/montrose/authorize")).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    stolen = await other_client.post("/v1/montrose/callback", json={"code": montrose.approve(url), "state": state})
    connected = await _connect(client, montrose)
    account_id = connected["accounts"][0]["id"]
    others = (await other_client.post("/v1/bank-accounts", json={"name": "B", "currency": "SEK", "subtype": "isk"})).json()

    assert (stolen.status_code, stolen.json()["detail"]) == (400, "This Montrose login wasn't started from your Bessel account.")
    assert (await other_client.get("/v1/montrose")).json()["connection"] is None
    assert (await other_client.patch(f"/v1/montrose/accounts/{account_id}", json={"bank_account_id": None})).status_code == 404
    assert (await other_client.post("/v1/montrose/sync")).status_code == 404
    assert (await other_client.delete("/v1/montrose")).status_code == 404
    assert (await client.patch(f"/v1/montrose/accounts/{account_id}", json={"bank_account_id": others["id"]})).status_code == 404
    assert (await client.get("/v1/montrose")).json()["connection"]["id"] == connected["id"]


def _row(
  row_id: int,
  category: str,
  day: str,
  amount: float,
  *,
  currency: str = "SEK",
  quantity: float = 0,
  price: float = 0,
  price_currency: str = "SEK",
  orderbook: int = 0,
  text: str = "",
  account: dict[str, Any] = ISK,
  canceled: bool = False,
) -> dict[str, Any]:
  return {
    "id": row_id,
    "accountId": account["accountId"],
    "accountNumber": int(account["accountNumber"].replace("-", "")),
    "category": category,
    "code": "X",
    "tradeDate": day,
    "settlementDate": day,
    "accountDate": day,
    "quantity": quantity,
    "price": price,
    "priceCurrency": price_currency,
    "amount": amount,
    "currency": currency,
    "instrumentId": "00000000-0000-0000-0000-000000000000",
    "orderbookId": orderbook,
    "text": text,
    "isCanceled": canceled,
  }


# Like the real account: shares moved in from Avanza, a deposit, a round trip in Safello, Strategy A sold in dollars, then a rights issue.
HISTORY = [
  _row(
    1, "SecuritiesTransferIn", "2025-03-31", 40060.97, currency="", quantity=14, price=285.2, price_currency="USD", orderbook=2122, text="Överfört från Avanza"
  ),
  _row(2, "Deposit", "2025-04-03", 2358.32, text="INS VIA SEB"),
  _row(3, "Buy", "2025-04-15", -1155, quantity=221, price=5.22, orderbook=1617),
  _row(4, "Sell", "2025-06-09", 1302, quantity=-221, price=5.9, orderbook=1617),
  _row(5, "Sell", "2025-06-09", 51761.59, quantity=-14, price=385.96, price_currency="USD", orderbook=2122),
  _row(6, "Other", "2026-06-11", 277, currency="", quantity=277, price=1, orderbook=6664, text="Nyemission avskiljning TREASURY CAPITAL"),
  _row(7, "Deposit", "2026-06-12", 999, canceled=True),
  _row(8, "Withdrawal", "2026-06-20", -500),
  _row(9, "Deposit", "2026-06-01", 5000, account=KF),
]
CASH = 2358.32 - 1155 + 1302 + 51761.59 - 500
HOLDINGS = [
  {
    "accountId": ISK["accountId"],
    "accountNumber": ISK["accountNumber"],
    "accountName": "",
    "accountType": "ISK",
    "currency": "SEK",
    "summary": {"totalMarketValue": 36564, "availableForPurchase": CASH, "totalValue": 36564 + CASH, "currency": "SEK"},
    "currencyPositions": [{"currencyCode": "SEK", "balance": CASH, "accruedInterest": 0, "availableForPurchase": CASH}],
    "positions": [
      {
        "instrumentName": "Treasury Capital",
        "ticker": "BTC B",
        "orderbookId": 6664,
        "quantity": 277,
        "marketValue": {"accountCurrency": 36564},
        "unrealizedResult": {"accountCurrency": -48230},
        "instrumentCurrency": "SEK",
      },
      {
        "instrumentName": "Treasury Capital SR 2",
        "ticker": "",
        "orderbookId": 0,
        "quantity": 277,
        "marketValue": {"accountCurrency": None},
        "unrealizedResult": {"accountCurrency": None},
        "instrumentCurrency": "SEK",
      },
    ],
  },
  {
    "accountId": KF["accountId"],
    "accountNumber": KF["accountNumber"],
    "accountName": "",
    "accountType": "KF",
    "currency": "SEK",
    "summary": {"totalMarketValue": 0, "availableForPurchase": 5000, "totalValue": 5000, "currency": "SEK"},
    "currencyPositions": [{"currencyCode": "SEK", "balance": 5000, "accruedInterest": 0, "availableForPurchase": 5000}],
    "positions": [],
  },
]
INSTRUMENTS = {
  1617: {"orderbookId": 1617, "ticker": "SFL", "name": "Safello Group"},
  2122: {"orderbookId": 2122, "ticker": "MSTR", "name": "Strategy A"},
  6664: {"orderbookId": 6664, "ticker": "BTC B", "name": "B Treasury Capital B"},
}


@pytest.fixture
def history(montrose: FakeMontrose) -> FakeMontrose:
  montrose.accounts = [ISK, KF]
  montrose.transactions, montrose.holdings, montrose.instruments = list(HISTORY), HOLDINGS, INSTRUMENTS
  return montrose


async def _linked(client: AsyncClient, save_fixture: SaveFixture, montrose: FakeMontrose, user: User) -> tuple[UUID, BankAccount]:
  connected = await _connect(client, montrose)
  bank_account = await _bank_account(save_fixture, user)
  isk = next(a for a in connected["accounts"] if a["account_type"] == "ISK")
  await client.patch(f"/v1/montrose/accounts/{isk['id']}", json={"bank_account_id": str(bank_account.id)})
  return UUID(connected["id"]), bank_account


async def _cash(session: AsyncSession, bank_account: BankAccount) -> list[tuple[str, int, TransactionDirection, str | None, str | None]]:
  rows = await session.execute(
    select(Transaction.transaction_date, Transaction.amount, Transaction.direction, Transaction.description, Transaction.transaction_type)
    .where(Transaction.bank_account_id == bank_account.id)
    .order_by(Transaction.transaction_date, Transaction.amount)
  )
  return [(day.isoformat(), amount, direction, description, kind) for day, amount, direction, description, kind in rows]


class TestImport:
  @pytest.mark.asyncio
  async def test_a_linked_account_brings_in_its_cash_trades_and_holdings(
    self,
    client: AsyncClient,
    session: AsyncSession,
    session_maker: SessionMaker,
    save_fixture: SaveFixture,
    history: FakeMontrose,
    user: User,
    job_queue_manager: JobQueueManager,
  ) -> None:
    strategy = Security(name="Strategy A", isin="US5949724083", asset_type=AssetType.stock, currency="USD")
    await save_fixture(strategy)
    connection_id, bank_account = await _linked(client, save_fixture, history, user)

    await montrose_service.sync(session_maker, connection_id)

    credit, debit = TransactionDirection.credit, TransactionDirection.debit
    assert await _cash(session, bank_account) == [
      ("2025-04-03", 235832, credit, "INS VIA SEB", "DEPOSIT"),
      ("2025-04-15", 115500, debit, "Köp Safello Group", "BUY"),
      ("2025-06-09", 130200, credit, "Sälj Safello Group", "SELL"),
      ("2025-06-09", 5176159, credit, "Sälj Strategy A", "SELL"),
      ("2026-06-20", 50000, debit, "Uttag", "WITHDRAW"),
    ]
    trades = (
      await session.execute(select(Trade, Security.name).join(Security).where(Trade.bank_account_id == bank_account.id).order_by(Trade.external_id))
    ).all()
    assert [(t.trade_type, t.trade_date.isoformat(), t.quantity, t.price_per_unit, t.currency, name) for t, name in trades] == [
      (TradeType.buy, "2025-04-15", 221_000_000, 522, "SEK", "Safello Group"),
      (TradeType.sell, "2025-06-09", 221_000_000, 590, "SEK", "Safello Group"),
      (TradeType.sell, "2025-06-09", 14_000_000, 38596, "USD", "Strategy A"),
    ]
    assert trades[2][0].security_id == strategy.id
    holdings = (await client.get("/v1/investments/holdings")).json()["items"]
    assert [(h["security_name"], h["quantity"], h["current_value"], h["cost_basis"]) for h in holdings] == [("Treasury Capital", 277_000_000, 3656400, 8479400)]
    [account] = [a for a in (await client.get("/v1/bank-accounts/overview")).json()["accounts"] if a["id"] == str(bank_account.id)]
    assert (account["bank_balance"], account["current_balance"], account["holdings_value"]) == (round(CASH * 100), round(CASH * 100), 3656400)

  @pytest.mark.asyncio
  async def test_syncing_again_adds_nothing_twice_and_reads_from_two_weeks_before_the_last_sync(
    self,
    client: AsyncClient,
    session: AsyncSession,
    session_maker: SessionMaker,
    save_fixture: SaveFixture,
    history: FakeMontrose,
    user: User,
    monkeypatch: pytest.MonkeyPatch,
    job_queue_manager: JobQueueManager,
  ) -> None:
    connection_id, bank_account = await _linked(client, save_fixture, history, user)
    await montrose_service.sync(session_maker, connection_id)
    first = await _cash(session, bank_account)
    history.transactions.append(_row(10, "Dividend", "2026-10-22", 12.5, orderbook=6664))
    monkeypatch.setattr(service, "utc_now", lambda: NOW + timedelta(days=1))

    await montrose_service.sync(session_maker, connection_id)

    assert await _cash(session, bank_account) == [*first, ("2026-10-22", 1250, TransactionDirection.credit, "Utdelning Treasury Capital", "DIVIDEND")]
    assert [r["from"] for r in history.transaction_requests if not r.get("cursor")] == ["2000-01-01", (NOW - timedelta(days=14)).date().isoformat()]
    assert all(r["accountIds"] == [ISK["accountId"]] for r in history.transaction_requests)
    assert len((await session.execute(select(Trade).where(Trade.bank_account_id == bank_account.id))).all()) == 3

  @pytest.mark.asyncio
  async def test_each_montrose_account_fills_only_its_own_bessel_account(
    self,
    client: AsyncClient,
    session: AsyncSession,
    session_maker: SessionMaker,
    save_fixture: SaveFixture,
    history: FakeMontrose,
    user: User,
    job_queue_manager: JobQueueManager,
  ) -> None:
    connection_id, isk_account = await _linked(client, save_fixture, history, user)
    kf_account = await _bank_account(save_fixture, user, name="Montrose KF")
    kf = next(a for a in (await client.get("/v1/montrose")).json()["connection"]["accounts"] if a["account_type"] == "KF")
    await client.patch(f"/v1/montrose/accounts/{kf['id']}", json={"bank_account_id": str(kf_account.id)})

    await montrose_service.sync(session_maker, connection_id)

    assert await _cash(session, kf_account) == [("2026-06-01", 500000, TransactionDirection.credit, "Insättning", "DEPOSIT")]
    assert len(await _cash(session, isk_account)) == 5

  @pytest.mark.asyncio
  async def test_nothing_is_read_for_accounts_that_arent_brought_in(
    self, client: AsyncClient, session: AsyncSession, session_maker: SessionMaker, history: FakeMontrose, user: User
  ) -> None:
    connection_id = UUID((await _connect(client, history))["id"])
    history.tool_calls.clear()

    await montrose_service.sync(session_maker, connection_id)

    assert history.tool_calls == ["get_user_accounts"]
    assert (await _stored(session, user)).sync_error is None
