"""Cross-user isolation: user A's data must never be visible to, or changeable by, user B.

`client` acts as user A and `other_client` as user B. Every test creates data
as A, then checks B can't read it, can't touch it by id, and can't change it
through any write. TestCoverage fails when an API route isn't covered here.
"""

import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from api.app import app
from api.common.encryption import encrypt
from api.models.calendar import Calendar
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.calendar_event import CalendarEvent
from api.models.category import Category
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.postgres import AsyncSession
from api.redis import create_redis, get_redis
from api.settings import settings
from api.tests.fixtures.database import SaveFixture
from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy import select

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
DAY_START = 1705276800  # 2024-01-15 00:00:00 UTC
DAY_END = DAY_START + 86400
SOURCE = "shared-hostname"

# Every (METHOD, path) of the public API, as audited by the tests below.
AUDITED: set[str] = {
  "POST /v1/activity/batch",
  "GET /v1/activity/daily",
  "GET /v1/activity/intraday",
  "GET /v1/activity/sources",
  "GET /v1/activity/summary",
  "GET /v1/agent-usage/daily",
  "GET /v1/agent-usage/status",
  "POST /v1/agent-usage/sync",
  "GET /v1/bank-accounts",
  "POST /v1/bank-accounts",
  "DELETE /v1/bank-accounts/{bank_account_id}",
  "GET /v1/bank-accounts/{bank_account_id}",
  "PATCH /v1/bank-accounts/{bank_account_id}",
  "GET /v1/calendars/accounts",
  "DELETE /v1/calendars/accounts/{account_id}",
  "POST /v1/calendars/accounts/{account_id}/sync",
  "GET /v1/calendars/events",
  "PATCH /v1/calendars/{calendar_id}",
  "POST /v1/calendars/{calendar_id}/events",
  "PATCH /v1/calendars/events/{event_id}",
  "DELETE /v1/calendars/events/{event_id}",
  "PUT /v1/calendars/events/{event_id}/response",
  "POST /v1/calendars/google/callback",
  "GET /v1/categories",
  "GET /v1/counters",
  "POST /v1/counters",
  "DELETE /v1/counters/{counter_id}",
  "PATCH /v1/counters/{counter_id}",
  "GET /v1/counters/{counter_id}/resets",
  "POST /v1/counters/{counter_id}/resets",
  "DELETE /v1/counters/{counter_id}/resets/{reset_id}",
  "GET /v1/devices",
  "DELETE /v1/devices/{device_id}",
  "PATCH /v1/devices/{device_id}",
  "POST /v1/healthkit/daily-metrics/sync",
  "GET /v1/healthkit/summary",
  "GET /v1/healthkit/sleep",
  "GET /v1/healthkit/sleep/daily",
  "GET /v1/healthkit/sleep/summary",
  "POST /v1/healthkit/sleep/sync",
  "GET /v1/healthkit/workouts",
  "POST /v1/healthkit/workouts/sync",
  "GET /v1/ingest-tokens",
  "POST /v1/ingest-tokens",
  "DELETE /v1/ingest-tokens/{token_id}",
  "GET /v1/investments/trades",
  "POST /v1/investments/trades",
  "DELETE /v1/investments/trades/{trade_id}",
  "PATCH /v1/investments/trades/{trade_id}",
  "POST /v1/klarna/import",
  "GET /v1/location-history/day",
  "POST /v1/location-history/import",
  "GET /v1/location-history/summary",
  "GET /v1/notifications",
  "POST /v1/notifications",
  "POST /v1/notifications/read-all",
  "POST /v1/notifications/{notification_id}/read",
  "GET /v1/places",
  "POST /v1/places",
  "DELETE /v1/places/{place_id}",
  "PATCH /v1/places/{place_id}",
  "GET /v1/projects",
  "POST /v1/projects",
  "DELETE /v1/projects/{project_id}",
  "PATCH /v1/projects/{project_id}",
  "PUT /v1/projects/{project_id}/location",
  "GET /v1/recipes",
  "POST /v1/recipes",
  "DELETE /v1/recipes/{recipe_id}",
  "GET /v1/recipes/{recipe_id}",
  "PATCH /v1/recipes/{recipe_id}",
  "GET /v1/tasks",
  "POST /v1/tasks",
  "GET /v1/tasks/areas",
  "PATCH /v1/tasks/reorder",
  "DELETE /v1/tasks/{task_id}",
  "GET /v1/tasks/{task_id}",
  "PATCH /v1/tasks/{task_id}",
  "POST /v1/tasks/{task_id}/attachments",
  "DELETE /v1/tasks/{task_id}/attachments/{attachment_id}",
  "GET /v1/tasks/{task_id}/attachments/{attachment_id}/file",
  "POST /v1/tasks/{task_id}/complete",
  "POST /v1/tasks/{task_id}/reopen",
  "POST /v1/tasks/{task_id}/undo-complete",
  "GET /v1/timeline",
  "DELETE /v1/transactions",
  "GET /v1/transactions",
  "PATCH /v1/transactions/bulk",
  "POST /v1/transactions/categorize-by-description",
  "POST /v1/transactions/import",
  "GET /v1/transactions/monthly-flow",
  "GET /v1/transactions/spending-by-category",
  "PATCH /v1/transactions/{transaction_id}",
}

_SHARED_SECURITIES = "Securities are a shared catalog — known gap, removal pending"

# Routes that hold no per-user data, or only create data for the caller.
EXEMPT: dict[str, str] = {
  "GET /healthz": "Liveness probe, no data",
  "GET /v1/auth/me": "Returns only the caller",
  "GET /v1/weather": "Public weather data, no user data",
  "GET /v1/investments/crypto/price/{coin_id}": "Public price data, no user data",
  "GET /v1/places/search": "External Google Places lookup, no stored data",
  "POST /v1/recipes/import": "Structures the posted text with an LLM; reads and stores nothing",
  "POST /v1/client-diagnostics": "Logs the caller's own crash reports; reads and stores nothing",
  "POST /v1/calendars/google/authorize": "Starts the caller's own connection flow",
  "POST /v1/calendars/icloud": "Creates an account for the caller only",
  "GET /v1/klarna/transactions": "Proxies the caller's own Klarna credentials; reads no Bessel data",
  "GET /v1/investments/holdings": _SHARED_SECURITIES,
  "GET /v1/investments/securities": _SHARED_SECURITIES,
  "POST /v1/investments/securities": _SHARED_SECURITIES,
  "DELETE /v1/investments/securities/{security_id}": _SHARED_SECURITIES,
  "PATCH /v1/investments/securities/{security_id}": _SHARED_SECURITIES,
  "GET /v1/investments/securities/{security_id}/prices": _SHARED_SECURITIES,
  "POST /v1/investments/securities/{security_id}/prices": _SHARED_SECURITIES,
}


def _ids(items: list[dict[str, Any]]) -> set[str]:
  return {item["id"] for item in items}


async def _create(client: AsyncClient, path: str, body: dict[str, Any]) -> dict[str, Any]:
  resp = await client.post(path, json=body)
  assert resp.status_code in (200, 201), resp.text
  return resp.json()


class TestCoverage:
  def test_every_route_is_audited_or_exempt(self) -> None:
    routes = {f"{method.upper()} {path}" for path, ops in app.openapi()["paths"].items() for method in ops}
    unaudited = sorted(routes - AUDITED - EXEMPT.keys())
    assert not unaudited, (
      f"Routes without a cross-user isolation test: {unaudited}. Add a test to test_isolation.py and list the route in AUDITED, "
      + "or add it to EXEMPT with a reason if it holds no per-user data."
    )

  def test_no_stale_entries(self) -> None:
    routes = {f"{method.upper()} {path}" for path, ops in app.openapi()["paths"].items() for method in ops}
    stale = sorted((AUDITED | EXEMPT.keys()) - routes)
    assert not stale, f"Listed routes that no longer exist: {stale}"


class TestTasks:
  @pytest.fixture(autouse=True)
  def _isolated_attachments_dir(self, tmp_path: Path) -> Any:
    original = settings.TASK_ATTACHMENTS_DIR
    settings.TASK_ATTACHMENTS_DIR = str(tmp_path)
    yield
    settings.TASK_ATTACHMENTS_DIR = original

  @pytest.mark.asyncio
  async def test_other_user_cannot_read_or_change_tasks(self, client: AsyncClient, other_client: AsyncClient) -> None:
    task = await _create(client, "/v1/tasks", {"title": "A's secret task", "area": "A-area", "position": 1.0})

    assert (await other_client.get("/v1/tasks")).json()["items"] == []
    assert "A-area" not in (await other_client.get("/v1/tasks/areas")).json()
    assert (await other_client.get(f"/v1/tasks/{task['id']}")).status_code == 404
    assert (await other_client.patch(f"/v1/tasks/{task['id']}", json={"title": "pwned"})).status_code == 404
    assert (await other_client.post(f"/v1/tasks/{task['id']}/complete")).status_code == 404
    assert (await other_client.post(f"/v1/tasks/{task['id']}/reopen")).status_code == 404
    assert (await other_client.post(f"/v1/tasks/{task['id']}/undo-complete")).status_code == 404
    await other_client.patch("/v1/tasks/reorder", json=[{"id": task["id"], "position": 99.0, "status": "done"}])
    assert (await other_client.delete(f"/v1/tasks/{task['id']}")).status_code == 404

    after = (await client.get(f"/v1/tasks/{task['id']}")).json()
    assert after["title"] == "A's secret task"
    assert after["position"] == 1.0
    assert after["status"] == "todo"

  @pytest.mark.asyncio
  async def test_other_user_cannot_touch_attachments(self, client: AsyncClient, other_client: AsyncClient) -> None:
    task = await _create(client, "/v1/tasks", {"title": "with image"})
    resp = await client.post(f"/v1/tasks/{task['id']}/attachments", files={"file": ("a.png", PNG_BYTES, "image/png")})
    assert resp.status_code == 201, resp.text
    attachment = resp.json()
    file_path = f"/v1/tasks/{task['id']}/attachments/{attachment['id']}/file"

    assert (await other_client.get(file_path)).status_code == 404
    assert (await other_client.delete(f"/v1/tasks/{task['id']}/attachments/{attachment['id']}")).status_code == 404
    upload = await other_client.post(f"/v1/tasks/{task['id']}/attachments", files={"file": ("b.png", PNG_BYTES, "image/png")})
    assert upload.status_code == 404

    own = await client.get(file_path)
    assert own.status_code == 200
    assert own.content == PNG_BYTES


class TestProjects:
  @pytest.mark.asyncio
  async def test_other_user_cannot_read_or_change_projects(self, client: AsyncClient, other_client: AsyncClient) -> None:
    project = await _create(client, "/v1/projects", {"name": "A project"})

    assert (await other_client.get("/v1/projects")).json() == []
    assert (await other_client.patch(f"/v1/projects/{project['id']}", json={"name": "pwned"})).status_code == 404
    location = await other_client.put(f"/v1/projects/{project['id']}/location", json={"path": "/tmp/x"}, headers={"X-Device-Id": "dev-b"})
    assert location.status_code == 404
    assert (await other_client.delete(f"/v1/projects/{project['id']}")).status_code == 404

    assert [p["name"] for p in (await client.get("/v1/projects")).json()] == ["A project"]


class TestPlaces:
  @pytest.mark.asyncio
  async def test_other_user_cannot_read_or_change_places(self, client: AsyncClient, other_client: AsyncClient) -> None:
    place = await _create(client, "/v1/places", {"name": "A's cafe", "latitude": 59.9, "longitude": 10.7})

    assert (await other_client.get("/v1/places")).json()["items"] == []
    assert (await other_client.patch(f"/v1/places/{place['id']}", json={"name": "pwned"})).status_code == 404
    assert (await other_client.delete(f"/v1/places/{place['id']}")).status_code == 404

    assert [p["name"] for p in (await client.get("/v1/places")).json()["items"]] == ["A's cafe"]


class TestLocationHistory:
  @pytest.mark.asyncio
  async def test_other_user_cannot_read_or_change_location_history(self, client: AsyncClient, other_client: AsyncClient) -> None:
    def visit(day: int, place: str) -> dict[str, Any]:
      return {
        "startTime": f"2026-09-0{day}T10:00:00.000+02:00",
        "endTime": f"2026-09-0{day}T11:00:00.000+02:00",
        "visit": {"hierarchyLevel": "0", "topCandidate": {"placeID": place, "placeLocation": "geo:59.3,18.0"}},
      }

    async def upload(c: AsyncClient, segments: list[dict[str, Any]]) -> dict[str, Any]:
      resp = await c.post("/v1/location-history/import", files={"file": ("Timeline.json", json.dumps(segments).encode(), "application/json")})
      assert resp.status_code == 200, resp.text
      return resp.json()

    await upload(client, [visit(1, "a-home"), visit(2, "a-office"), visit(3, "a-gym")])

    summary = (await other_client.get("/v1/location-history/summary")).json()
    assert summary["days"] == [] and summary["last_import"] is None
    assert (await other_client.get("/v1/location-history/day", params={"date": "2026-09-01"})).json()["visits"] == []

    # The same segments from B are B's own: nothing of A's is matched, edited or removed.
    other = await upload(other_client, [visit(1, "b-home"), visit(3, "a-gym")])
    assert (other["added"], other["updated"], other["removed"], other["unchanged"]) == (2, 0, 0, 0)

    assert [v["place_id"] for v in (await client.get("/v1/location-history/day", params={"date": "2026-09-01"})).json()["visits"]] == ["a-home"]
    assert (await client.get("/v1/location-history/summary")).json()["days"] == ["2026-09-01", "2026-09-02", "2026-09-03"]


class TestRecipes:
  @pytest.mark.asyncio
  async def test_other_user_cannot_read_or_change_recipes(self, client: AsyncClient, other_client: AsyncClient) -> None:
    recipe = await _create(client, "/v1/recipes", {"title": "A's recipe", "content": "secret sauce"})

    assert (await other_client.get("/v1/recipes")).json()["items"] == []
    assert (await other_client.get(f"/v1/recipes/{recipe['id']}")).status_code == 404
    assert (await other_client.patch(f"/v1/recipes/{recipe['id']}", json={"title": "pwned"})).status_code == 404
    assert (await other_client.delete(f"/v1/recipes/{recipe['id']}")).status_code == 404

    assert (await client.get(f"/v1/recipes/{recipe['id']}")).json()["title"] == "A's recipe"


class TestCounters:
  @pytest.mark.asyncio
  async def test_other_user_cannot_read_or_change_counters(self, client: AsyncClient, other_client: AsyncClient) -> None:
    counter = await _create(client, "/v1/counters", {"name": "A counter"})
    reset = await _create(client, f"/v1/counters/{counter['id']}/resets", {})

    assert (await other_client.get("/v1/counters")).json() == []
    assert (await other_client.patch(f"/v1/counters/{counter['id']}", json={"name": "pwned"})).status_code == 404
    assert (await other_client.get(f"/v1/counters/{counter['id']}/resets")).status_code == 404
    assert (await other_client.post(f"/v1/counters/{counter['id']}/resets")).status_code == 404
    assert (await other_client.delete(f"/v1/counters/{counter['id']}/resets/{reset['id']}")).status_code == 404
    assert (await other_client.delete(f"/v1/counters/{counter['id']}")).status_code == 404

    assert [c["name"] for c in (await client.get("/v1/counters")).json()] == ["A counter"]
    assert len((await client.get(f"/v1/counters/{counter['id']}/resets")).json()) == 1


class TestNotifications:
  @pytest.mark.asyncio
  async def test_other_user_cannot_read_or_mark_notifications(self, client: AsyncClient, other_client: AsyncClient) -> None:
    notification = await _create(client, "/v1/notifications", {"title": "A's alert"})

    listing = (await other_client.get("/v1/notifications")).json()
    assert listing["notifications"] == []
    assert listing["unread_count"] == 0
    assert (await other_client.post(f"/v1/notifications/{notification['id']}/read")).status_code == 404
    assert (await other_client.post("/v1/notifications/read-all")).json()["marked_read"] == 0

    own = (await client.get("/v1/notifications")).json()
    assert own["unread_count"] == 1


class TestDevices:
  @pytest.mark.asyncio
  async def test_same_device_key_is_separate_per_user(self, client: AsyncClient, other_client: AsyncClient) -> None:
    await client.get("/v1/projects", headers={"X-Device-Id": "shared-key", "X-Device-Name": "A laptop"})
    devices = (await client.get("/v1/devices")).json()
    assert [d["name"] for d in devices] == ["A laptop"]
    device_id = devices[0]["id"]

    await other_client.get("/v1/projects", headers={"X-Device-Id": "shared-key", "X-Device-Name": "B laptop"})
    assert [d["name"] for d in (await other_client.get("/v1/devices")).json()] == ["B laptop"]
    assert (await other_client.patch(f"/v1/devices/{device_id}", json={"name": "pwned"})).status_code == 404
    assert (await other_client.delete(f"/v1/devices/{device_id}")).status_code == 404

    assert [d["name"] for d in (await client.get("/v1/devices")).json()] == ["A laptop"]


class TestBankingAndTransactions:
  @pytest.mark.asyncio
  async def test_other_user_cannot_read_or_change_bank_accounts(self, client: AsyncClient, other_client: AsyncClient) -> None:
    account = await _create(client, "/v1/bank-accounts", {"name": "A checking", "currency": "NOK", "subtype": "checking"})

    assert (await other_client.get("/v1/bank-accounts")).json()["items"] == []
    assert (await other_client.get(f"/v1/bank-accounts/{account['id']}")).status_code == 404
    assert (await other_client.patch(f"/v1/bank-accounts/{account['id']}", json={"name": "pwned"})).status_code == 404
    assert (await other_client.delete(f"/v1/bank-accounts/{account['id']}")).status_code == 404

    assert (await client.get(f"/v1/bank-accounts/{account['id']}")).json()["name"] == "A checking"

  @pytest.mark.asyncio
  async def test_other_user_cannot_read_or_change_transactions(
    self, client: AsyncClient, other_client: AsyncClient, save_owned: SaveFixture, other_user: User
  ) -> None:
    account = await _create(client, "/v1/bank-accounts", {"name": "A checking", "currency": "NOK", "subtype": "checking"})
    category = Category(name="Groceries", slug="groceries", color="#22c55e")
    await save_owned(category)
    today = datetime.now(UTC).date()
    tx = Transaction(
      amount=12_300,
      currency="NOK",
      transaction_date=today,
      direction=TransactionDirection.debit,
      dedup_hash=f"a-{uuid4().hex}",
      description="A's grocery store",
      bank_account_id=UUID(account["id"]),
      category_id=category.id,
    )
    await save_owned(tx)
    tx_id = str(tx.id)

    assert (await other_client.get("/v1/transactions")).json()["items"] == []
    assert (await other_client.get("/v1/categories")).json()["items"] == []
    assert all(m["income"] == 0 and m["expenses"] == 0 for m in (await other_client.get("/v1/transactions/monthly-flow")).json()["items"])
    spending = await other_client.get("/v1/transactions/spending-by-category", params={"year": today.year, "month": today.month})
    assert spending.json()["items"] == []

    assert (await other_client.patch(f"/v1/transactions/{tx_id}", json={"is_business": True})).status_code == 404
    bulk = await other_client.patch("/v1/transactions/bulk", json={"ids": [tx_id], "category_id": None})
    assert bulk.status_code == 404 or bulk.json()["updated"] == 0
    categorize = await other_client.post("/v1/transactions/categorize-by-description", json={"description": "A's grocery store", "category_id": None})
    assert categorize.status_code == 404 or categorize.json()["updated"] == 0
    delete = await other_client.request("DELETE", "/v1/transactions", json={"ids": [tx_id]})
    assert delete.status_code == 404 or delete.json().get("deleted", 0) == 0

    imported = await other_client.post(
      "/v1/transactions/import",
      params={"bank": "marginalen", "bank_account_id": account["id"]},
      files={"file": ("export.csv", b"date,amount\n2024-01-01,1\n", "text/csv")},
    )
    assert imported.status_code == 404

    own = (await client.get("/v1/transactions")).json()["items"]
    assert [t["id"] for t in own] == [tx_id]
    assert own[0]["category_id"] == str(category.id)
    assert own[0]["is_business"] is False

  @pytest.mark.asyncio
  async def test_klarna_import_into_other_users_account_is_rejected(
    self, client: AsyncClient, other_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
  ) -> None:
    account = await _create(client, "/v1/bank-accounts", {"name": "A card", "currency": "NOK", "subtype": "credit"})

    async def _no_network(*_: Any, **__: Any) -> list[Any]:
      raise AssertionError("Klarna must not be called before the ownership check")

    monkeypatch.setattr("api.klarna.endpoints.fetch_klarna_items", _no_network)
    resp = await other_client.post("/v1/klarna/import", json={"bank_account_id": account["id"], "authorization": "Bearer x"})
    assert resp.status_code == 404


class TestTrades:
  @pytest.mark.asyncio
  async def test_other_user_cannot_read_or_change_trades(self, client: AsyncClient, other_client: AsyncClient) -> None:
    account = await _create(client, "/v1/bank-accounts", {"name": "A broker", "currency": "USD", "subtype": "investment"})
    security = await _create(client, "/v1/investments/securities", {"name": "Isolation Corp", "ticker": "ISO", "asset_type": "stock", "currency": "USD"})
    trade = await _create(
      client,
      "/v1/investments/trades",
      {
        "security_id": security["id"],
        "bank_account_id": account["id"],
        "trade_type": "buy",
        "trade_date": "2024-01-15",
        "quantity": 1_000_000,
        "price_per_unit": 10_000,
        "currency": "USD",
      },
    )

    assert (await other_client.get("/v1/investments/trades")).json()["items"] == []
    assert (await other_client.get("/v1/investments/holdings")).json()["items"] == []
    assert (await other_client.patch(f"/v1/investments/trades/{trade['id']}", json={"quantity": 5})).status_code == 404
    assert (await other_client.delete(f"/v1/investments/trades/{trade['id']}")).status_code == 404
    stolen = await other_client.post(
      "/v1/investments/trades",
      json={
        "security_id": security["id"],
        "bank_account_id": account["id"],
        "trade_type": "sell",
        "trade_date": "2024-01-16",
        "quantity": 1_000_000,
        "price_per_unit": 1,
        "currency": "USD",
      },
    )
    assert stolen.status_code == 404

    own = (await client.get("/v1/investments/trades")).json()["items"]
    assert [t["id"] for t in own] == [trade["id"]]
    assert own[0]["quantity"] == 1_000_000


def _sleep_sample(start: datetime, minutes: int) -> dict[str, Any]:
  return {
    "healthkit_uuid": str(uuid4()),
    "sleep_value": 3,
    "sleep_value_name": "asleepCore",
    "start_date": start.isoformat(),
    "end_date": (start + timedelta(minutes=minutes)).isoformat(),
    "source_name": "Apple Watch",
    "source_bundle_id": "com.apple.health",
    "source_version": "11.0",
    "device_name": "Apple Watch",
    "sample_metadata": None,
  }


def _workout(start: datetime) -> dict[str, Any]:
  return {
    "healthkit_uuid": str(uuid4()),
    "workout_activity_type": 37,
    "workout_activity_type_name": "running",
    "start_date": start.isoformat(),
    "end_date": (start + timedelta(minutes=30)).isoformat(),
    "duration": 1800.0,
    "total_energy_burned": 350.0,
    "total_distance": 5000.0,
    "source_name": "Apple Watch",
    "source_bundle_id": "com.apple.health",
    "source_version": "11.0",
    "device_name": "Apple Watch",
    "workout_metadata": None,
    "statistics": None,
  }


class TestHealthKit:
  @pytest.mark.asyncio
  async def test_other_user_sees_no_sleep_or_workouts(self, client: AsyncClient, other_client: AsyncClient) -> None:
    night = datetime.fromtimestamp(DAY_START, tz=UTC) + timedelta(hours=1)
    sample = _sleep_sample(night, 120)
    resp = await client.post("/v1/healthkit/sleep/sync", json={"samples": [sample], "deleted_uuids": []})
    assert resp.status_code == 200
    assert (await client.post("/v1/healthkit/workouts/sync", json={"workouts": [_workout(night)], "deleted_uuids": []})).status_code == 200

    window = {"start_ts": DAY_START, "end_ts": DAY_END}
    assert (await other_client.get("/v1/healthkit/sleep")).json()["items"] == []
    assert (await other_client.get("/v1/healthkit/sleep/daily", params=window)).json()["nights"] == []
    assert (await other_client.get("/v1/healthkit/sleep/summary", params=window)).json()["total_asleep_secs"] == 0
    assert (await other_client.get("/v1/healthkit/workouts")).json()["items"] == []

    # B deleting A's sample by its HealthKit UUID must not touch A's copy.
    await other_client.post("/v1/healthkit/sleep/sync", json={"samples": [], "deleted_uuids": [sample["healthkit_uuid"]]})
    assert len((await client.get("/v1/healthkit/sleep")).json()["items"]) == 1
    assert len((await client.get("/v1/healthkit/workouts")).json()["items"]) == 1

  @pytest.mark.asyncio
  async def test_other_user_sees_no_daily_metrics_or_summary(self, client: AsyncClient, other_client: AsyncClient) -> None:
    night = datetime.fromtimestamp(DAY_START, tz=UTC) + timedelta(hours=1)
    day = night.date().isoformat()
    await client.post("/v1/healthkit/sleep/sync", json={"samples": [_sleep_sample(night, 120)], "deleted_uuids": []})
    await client.post("/v1/healthkit/daily-metrics/sync", json={"days": [{"date": day, "steps": 9000, "hrv_ms": 60}]})

    params = {"date": day, "tz_name": "UTC"}
    other = (await other_client.get("/v1/healthkit/summary", params=params)).json()
    assert (other["sleep"], other["move"], other["energy"]) == (None, None, None)

    # B syncing the same date must not overwrite A's values.
    await other_client.post("/v1/healthkit/daily-metrics/sync", json={"days": [{"date": day, "steps": 1}]})
    assert (await client.get("/v1/healthkit/summary", params=params)).json()["move"]["steps"] == 9000


def _events(*local_ids: int, app_class: str = "secret-app") -> list[dict[str, Any]]:
  return [{"local_id": i, "ts": DAY_START + 9 * 3600 + i * 60, "state": "active", "app_class": app_class, "title": "A's private doc"} for i in local_ids]


class TestActivity:
  @pytest.mark.asyncio
  async def test_other_user_sees_no_activity(
    self, client: AsyncClient, other_client: AsyncClient, ingest_headers: dict[str, str], other_ingest_headers: dict[str, str]
  ) -> None:
    resp = await client.post("/v1/activity/batch", json={"source": SOURCE, "events": _events(1, 2, 3)}, headers=ingest_headers)
    assert resp.json()["inserted"] == 3

    window = {"start_ts": DAY_START, "end_ts": DAY_END, "source": SOURCE}
    assert (await other_client.get("/v1/activity/sources")).json()["sources"] == []
    summary = (await other_client.get("/v1/activity/summary", params=window)).json()
    assert summary["apps"] == []
    assert summary["sources"] == []
    assert (await other_client.get("/v1/activity/daily", params=window)).json()["days"] == []
    assert (await other_client.get("/v1/activity/intraday", params=window)).json()["buckets"] == []
    timeline = (await other_client.get("/v1/timeline", params={"start_ts": DAY_START, "end_ts": DAY_END})).json()
    assert timeline["source"] is None
    assert all(lane["segments"] == [] for lane in timeline["lanes"])
    assert (await other_client.get("/v1/timeline", params={"start_ts": DAY_START, "end_ts": DAY_END, "source": SOURCE})).json()["tracked_secs"] == 0

  @pytest.mark.asyncio
  async def test_same_source_and_local_id_do_not_collide(
    self, client: AsyncClient, other_client: AsyncClient, ingest_headers: dict[str, str], other_ingest_headers: dict[str, str]
  ) -> None:
    await client.post("/v1/activity/batch", json={"source": SOURCE, "events": _events(1, 2)}, headers=ingest_headers)
    resp = await other_client.post("/v1/activity/batch", json={"source": SOURCE, "events": _events(1, 2, app_class="b-app")}, headers=other_ingest_headers)
    assert resp.json()["inserted"] == 2

    window = {"start_ts": DAY_START, "end_ts": DAY_END, "source": SOURCE}
    assert [a["app_class"] for a in (await client.get("/v1/activity/summary", params=window)).json()["apps"]] == ["secret-app"]
    assert [a["app_class"] for a in (await other_client.get("/v1/activity/summary", params=window)).json()["apps"]] == ["b-app"]


def _daily(input_tokens: int) -> dict[str, Any]:
  return {
    "device": "shared-device",
    "agent": "claude-code",
    "date": "2026-08-15",
    "models": [{"model": "claude-opus-4", "input_tokens": input_tokens, "output_tokens": 1, "cache_read_tokens": 0, "cache_creation_tokens": 0}],
  }


def _rate_limit(pct: float) -> dict[str, Any]:
  return {"device": "shared-device", "agent": "claude-code", "window_label": "session_5h", "utilization_pct": pct}


class TestAgentUsage:
  @pytest.mark.asyncio
  async def test_other_user_sees_and_overwrites_nothing(
    self, client: AsyncClient, other_client: AsyncClient, ingest_headers: dict[str, str], other_ingest_headers: dict[str, str]
  ) -> None:
    await client.post("/v1/agent-usage/sync", json={"daily": [_daily(100)], "rate_limits": [_rate_limit(42.0)]}, headers=ingest_headers)
    window = {"start_date": "2026-08-01", "end_date": "2026-08-31"}

    assert (await other_client.get("/v1/agent-usage/status")).json()["entries"] == []
    assert (await other_client.get("/v1/agent-usage/daily", params=window)).json()["entries"] == []

    await other_client.post("/v1/agent-usage/sync", json={"daily": [_daily(999)], "rate_limits": [_rate_limit(99.0)]}, headers=other_ingest_headers)
    assert [e["input_tokens"] for e in (await client.get("/v1/agent-usage/daily", params=window)).json()["entries"]] == [100]
    assert [e["utilization_pct"] for e in (await client.get("/v1/agent-usage/status")).json()["entries"]] == [42.0]
    assert [e["input_tokens"] for e in (await other_client.get("/v1/agent-usage/daily", params=window)).json()["entries"]] == [999]


class TestIngestTokens:
  @pytest.mark.asyncio
  async def test_tokens_are_private_and_revocable(self, client: AsyncClient, other_client: AsyncClient) -> None:
    created = await _create(client, "/v1/ingest-tokens", {"name": "monitor:laptop"})
    headers = {"X-Api-Key": created["token"]}

    assert (await other_client.get("/v1/ingest-tokens")).json() == []
    assert (await other_client.delete(f"/v1/ingest-tokens/{created['id']}")).status_code == 404
    assert [t["id"] for t in (await client.get("/v1/ingest-tokens")).json()] == [created["id"]]
    assert "token" not in (await client.get("/v1/ingest-tokens")).json()[0]

    assert (await client.post("/v1/activity/batch", json={"source": SOURCE, "events": []}, headers=headers)).status_code == 200
    assert (await client.delete(f"/v1/ingest-tokens/{created['id']}")).status_code == 204
    assert (await client.post("/v1/activity/batch", json={"source": SOURCE, "events": []}, headers=headers)).status_code == 401

  @pytest.mark.asyncio
  async def test_recreating_a_name_revokes_the_old_token(self, client: AsyncClient) -> None:
    old = await _create(client, "/v1/ingest-tokens", {"name": "collector:laptop"})
    new = await _create(client, "/v1/ingest-tokens", {"name": "collector:laptop"})

    assert (await client.post("/v1/agent-usage/sync", json={}, headers={"X-Api-Key": old["token"]})).status_code == 401
    assert (await client.post("/v1/agent-usage/sync", json={}, headers={"X-Api-Key": new["token"]})).status_code == 200

  @pytest.mark.asyncio
  @pytest.mark.parametrize("path", ["/v1/activity/batch", "/v1/agent-usage/sync"])
  async def test_invalid_or_missing_token_rejected(self, client: AsyncClient, path: str) -> None:
    body = {"source": SOURCE, "events": []} if "activity" in path else {}
    assert (await client.post(path, json=body, headers={"X-Api-Key": "bsl_not-a-real-token"})).status_code == 401
    assert (await client.post(path, json=body)).status_code == 401


class TestCalendars:
  @pytest.mark.asyncio
  async def test_other_user_cannot_read_or_change_calendars(
    self, client: AsyncClient, other_client: AsyncClient, save_fixture: SaveFixture, user: User, session: AsyncSession
  ) -> None:
    account = CalendarAccount(user_id=user.id, provider=CalendarProvider.google, email="a@example.com", encrypted_credentials="not-used")
    await save_fixture(account)
    calendar = Calendar(account_id=account.id, external_id="primary", name="A's calendar", color="#3b82f6")
    await save_fixture(calendar)
    start = datetime.fromtimestamp(DAY_START, tz=UTC) + timedelta(hours=10)
    event = CalendarEvent(
      calendar_id=calendar.id, external_id="evt-1", title="A's private meeting", all_day=False, start_at=start, end_at=start + timedelta(hours=1)
    )
    await save_fixture(event)
    calendar_id = calendar.id

    window = {"start_ts": DAY_START, "end_ts": DAY_END}
    assert (await other_client.get("/v1/calendars/accounts")).json()["accounts"] == []
    assert (await other_client.get("/v1/calendars/events", params=window)).json()["events"] == []
    assert (await other_client.patch(f"/v1/calendars/{calendar.id}", json={"hidden": True})).status_code == 404
    assert (await other_client.post(f"/v1/calendars/accounts/{account.id}/sync")).status_code == 404
    assert (await other_client.delete(f"/v1/calendars/accounts/{account.id}")).status_code == 404

    events = (await client.get("/v1/calendars/events", params=window)).json()["events"]
    assert [e["title"] for e in events] == ["A's private meeting"]
    assert (await session.execute(select(Calendar.hidden).where(Calendar.id == calendar_id))).scalar_one() is False

  @pytest_asyncio.fixture
  async def _redis(self) -> AsyncIterator[None]:
    redis = create_redis("script")
    app.dependency_overrides[get_redis] = lambda: redis
    yield
    app.dependency_overrides.pop(get_redis)
    await redis.aclose()

  @pytest.fixture
  def _calendar_secrets(self, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "client-id")
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "client-secret")

  @pytest.mark.asyncio
  async def test_other_user_cannot_create_change_or_delete_events(
    self, other_client: AsyncClient, save_fixture: SaveFixture, user: User, session: AsyncSession, _calendar_secrets: None, _redis: None
  ) -> None:
    account = CalendarAccount(
      user_id=user.id, provider=CalendarProvider.google, email="a@example.com", encrypted_credentials=encrypt("refresh"), can_write=True
    )
    await save_fixture(account)
    calendar = Calendar(account_id=account.id, external_id="primary", name="A's calendar", color="#3b82f6", writable=True)
    await save_fixture(calendar)
    start = datetime.fromtimestamp(DAY_START, tz=UTC) + timedelta(hours=10)
    event = CalendarEvent(
      calendar_id=calendar.id, external_id="evt-1", title="A's meeting", all_day=False, start_at=start, end_at=start + timedelta(hours=1), editable=True
    )
    await save_fixture(event)
    event_id = event.id
    timing = {"start": {"date_time": "2024-01-15T12:00"}, "end": {"date_time": "2024-01-15T13:00"}, "time_zone": "Europe/Stockholm"}

    created = await other_client.post(f"/v1/calendars/{calendar.id}/events", json={"title": "Planted", "time_zone": "Europe/Stockholm", "timing": timing})
    assert created.status_code == 404, created.text
    changed = await other_client.patch(f"/v1/calendars/events/{event_id}", json={"time_zone": "Europe/Stockholm", "title": "Hijacked"})
    assert changed.status_code == 404, changed.text
    deleted = await other_client.delete(f"/v1/calendars/events/{event_id}", params={"time_zone": "Europe/Stockholm"})
    assert deleted.status_code == 404, deleted.text
    replied = await other_client.put(f"/v1/calendars/events/{event_id}/response", json={"response": "declined"})
    assert replied.status_code == 404, replied.text

    titles = (await session.execute(select(CalendarEvent.title).where(CalendarEvent.calendar_id == calendar.id))).scalars().all()
    assert titles == ["A's meeting"]

  @pytest.mark.asyncio
  async def test_google_sign_in_cannot_land_in_another_users_account(
    self, client: AsyncClient, other_client: AsyncClient, session: AsyncSession, _calendar_secrets: None
  ) -> None:
    url = (await client.post("/v1/calendars/google/authorize")).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]

    resp = await other_client.post("/v1/calendars/google/callback", json={"code": "c", "state": state})

    assert resp.status_code in (400, 422), resp.text
    assert (await session.execute(select(CalendarAccount))).scalars().all() == []
