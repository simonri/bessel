from typing import Any

import pytest
from api.settings import settings
from httpx import AsyncClient

API_KEY = "test-agent-usage-key"
DEVICE = "test-laptop"
AGENT = "claude-code"


@pytest.fixture
def api_key(monkeypatch: pytest.MonkeyPatch) -> str:
  monkeypatch.setattr(settings, "INTERNAL_API_KEY", API_KEY)
  return API_KEY


def _daily_upload(date: str, model: str = "claude-opus-4", input_tokens: int = 100, output_tokens: int = 50) -> dict[str, Any]:
  return {
    "device": DEVICE,
    "agent": AGENT,
    "date": date,
    "models": [
      {
        "model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cache_read_tokens": 0,
        "cache_creation_tokens": 0,
      }
    ],
  }


def _rate_limit_upload(window_label: str = "session_5h", utilization_pct: float = 42.0) -> dict[str, Any]:
  return {
    "device": DEVICE,
    "agent": AGENT,
    "window_label": window_label,
    "utilization_pct": utilization_pct,
    "resets_at": None,
    "tier": "Max 20x",
  }


async def _sync(
  client: AsyncClient, api_key: str, *, daily: list[dict[str, Any]] | None = None, rate_limits: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
  resp = await client.post(
    "/v1/agent-usage/sync",
    json={"daily": daily or [], "rate_limits": rate_limits or []},
    headers={"X-Api-Key": api_key},
  )
  assert resp.status_code == 200
  return resp.json()


class TestSyncAgentUsage:
  @pytest.mark.asyncio
  async def test_empty_request(self, client: AsyncClient, api_key: str) -> None:
    data = await _sync(client, api_key)
    assert data == {"daily_synced": 0, "status_synced": 0}

  @pytest.mark.asyncio
  async def test_missing_api_key_rejected(self, client: AsyncClient, api_key: str) -> None:
    resp = await client.post("/v1/agent-usage/sync", json={"daily": [], "rate_limits": []})
    assert resp.status_code == 401

  @pytest.mark.asyncio
  async def test_wrong_api_key_rejected(self, client: AsyncClient, api_key: str) -> None:
    resp = await client.post(
      "/v1/agent-usage/sync",
      json={"daily": [], "rate_limits": []},
      headers={"X-Api-Key": "wrong-key"},
    )
    assert resp.status_code == 401

  @pytest.mark.asyncio
  async def test_unset_internal_api_key_rejects_everything(self, client: AsyncClient) -> None:
    # No `api_key` fixture used here: settings.INTERNAL_API_KEY defaults to "",
    # which must never authenticate a request no matter the header value.
    resp = await client.post(
      "/v1/agent-usage/sync",
      json={"daily": [], "rate_limits": []},
      headers={"X-Api-Key": ""},
    )
    assert resp.status_code == 401

  @pytest.mark.asyncio
  async def test_insert_new_daily_rows(self, client: AsyncClient, api_key: str) -> None:
    data = await _sync(client, api_key, daily=[_daily_upload("2026-08-15")])
    assert data["daily_synced"] == 1

    resp = await client.get("/v1/agent-usage/daily", params={"start_date": "2026-08-01", "end_date": "2026-08-31"})
    entries = resp.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["input_tokens"] == 100

  @pytest.mark.asyncio
  async def test_resync_same_day_overwrites_not_sums(self, client: AsyncClient, api_key: str) -> None:
    await _sync(client, api_key, daily=[_daily_upload("2026-08-15", input_tokens=100, output_tokens=50)])
    data = await _sync(client, api_key, daily=[_daily_upload("2026-08-15", input_tokens=300, output_tokens=150)])
    assert data["daily_synced"] == 1

    resp = await client.get("/v1/agent-usage/daily", params={"start_date": "2026-08-01", "end_date": "2026-08-31"})
    entries = resp.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["input_tokens"] == 300
    assert entries[0]["output_tokens"] == 150

  @pytest.mark.asyncio
  async def test_in_request_duplicates_last_wins(self, client: AsyncClient, api_key: str) -> None:
    data = await _sync(
      client,
      api_key,
      daily=[
        _daily_upload("2026-08-15", input_tokens=100),
        _daily_upload("2026-08-15", input_tokens=999),
      ],
    )
    assert data["daily_synced"] == 1

    resp = await client.get("/v1/agent-usage/daily", params={"start_date": "2026-08-01", "end_date": "2026-08-31"})
    entries = resp.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["input_tokens"] == 999

  @pytest.mark.asyncio
  async def test_insert_rate_limit_status(self, client: AsyncClient, api_key: str) -> None:
    data = await _sync(client, api_key, rate_limits=[_rate_limit_upload(utilization_pct=42.0)])
    assert data["status_synced"] == 1

    resp = await client.get("/v1/agent-usage/status")
    entries = resp.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["utilization_pct"] == 42.0
    assert entries[0]["tier"] == "Max 20x"

  @pytest.mark.asyncio
  async def test_resync_status_overwrites(self, client: AsyncClient, api_key: str) -> None:
    await _sync(client, api_key, rate_limits=[_rate_limit_upload(utilization_pct=10.0)])
    await _sync(client, api_key, rate_limits=[_rate_limit_upload(utilization_pct=87.5)])

    resp = await client.get("/v1/agent-usage/status")
    entries = resp.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["utilization_pct"] == 87.5
