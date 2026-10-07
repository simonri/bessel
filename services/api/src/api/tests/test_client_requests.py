import json
from collections.abc import AsyncIterator
from uuid import uuid4

import httpx
import pytest
import pytest_asyncio
from api.idempotency import IDEMPOTENCY_HEADER, REPLAYED_HEADER, IdempotencyMiddleware
from api.middlewares import REQUEST_ID_HEADER
from api.redis import Redis, create_redis
from api.settings import settings
from fastapi import FastAPI, HTTPException
from httpx import AsyncClient
from pydantic import BaseModel
from starlette.datastructures import Headers
from starlette.types import Scope


class TestRequestContext:
  @pytest.mark.asyncio
  async def test_echoes_the_clients_request_id(self, client: AsyncClient) -> None:
    request_id = str(uuid4())
    response = await client.get("/v1/auth/me", headers={REQUEST_ID_HEADER: request_id})
    assert response.headers[REQUEST_ID_HEADER] == request_id

  @pytest.mark.asyncio
  async def test_replaces_a_malformed_request_id(self, client: AsyncClient) -> None:
    response = await client.get("/v1/auth/me", headers={REQUEST_ID_HEADER: "not ok\nat all"})
    assert response.headers[REQUEST_ID_HEADER] != "not ok\nat all"
    assert len(response.headers[REQUEST_ID_HEADER]) == 32


class TestMinimumClientVersion:
  @pytest.fixture(autouse=True)
  def require_build_10(self, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "IOS_MIN_BUILD", 10)

  @pytest.mark.asyncio
  async def test_turns_away_old_ios_builds(self, client: AsyncClient) -> None:
    response = await client.get("/v1/auth/me", headers={"X-Client-Platform": "ios", "X-Client-Build": "9"})
    assert response.status_code == 426
    assert response.json()["error"] == "UpgradeRequired"

  @pytest.mark.asyncio
  @pytest.mark.parametrize(
    "headers",
    [
      {"X-Client-Platform": "ios", "X-Client-Build": "10"},
      {"X-Client-Platform": "ios"},
      {"X-Client-Platform": "web", "X-Client-Build": "1"},
      {},
    ],
  )
  async def test_serves_everyone_else(self, client: AsyncClient, headers: dict[str, str]) -> None:
    response = await client.get("/v1/auth/me", headers=headers)
    assert response.status_code == 200


class Item(BaseModel):
  title: str


@pytest_asyncio.fixture
async def redis() -> AsyncIterator[Redis]:
  client = create_redis("script")
  yield client
  await client.aclose()


class Endpoint:
  """A write endpoint that counts how often it really ran."""

  def __init__(self) -> None:
    self.calls = 0
    self.fail_with: int | None = None


@pytest_asyncio.fixture
async def endpoint() -> Endpoint:
  return Endpoint()


@pytest_asyncio.fixture
async def idempotent_client(redis: Redis, endpoint: Endpoint) -> AsyncIterator[AsyncClient]:
  app = FastAPI()

  @app.post("/items", status_code=201)
  async def create_item(item: Item) -> dict[str, object]:
    endpoint.calls += 1
    if endpoint.fail_with:
      raise HTTPException(status_code=endpoint.fail_with, detail="Unavailable")
    return {"title": item.title, "call": endpoint.calls}

  async def identify(scope: Scope) -> str | None:
    return Headers(scope=scope).get("x-account") or None

  app.add_middleware(IdempotencyMiddleware, identify=identify, get_redis=lambda scope: redis)
  async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", headers={"x-account": "alice"}) as client:
    yield client


class TestIdempotency:
  @pytest.mark.asyncio
  async def test_a_retried_write_runs_once_and_replays_the_response(self, idempotent_client: AsyncClient, endpoint: Endpoint) -> None:
    key = str(uuid4())
    first = await idempotent_client.post("/items", json={"title": "Milk"}, headers={IDEMPOTENCY_HEADER: key})
    second = await idempotent_client.post("/items", json={"title": "Milk"}, headers={IDEMPOTENCY_HEADER: key})

    assert endpoint.calls == 1
    assert (first.status_code, second.status_code) == (201, 201)
    assert second.json() == first.json()
    assert first.headers[IDEMPOTENCY_HEADER] == key
    assert second.headers[REPLAYED_HEADER] == "true"
    assert REPLAYED_HEADER not in first.headers

  @pytest.mark.asyncio
  async def test_writes_without_a_key_always_run(self, idempotent_client: AsyncClient, endpoint: Endpoint) -> None:
    await idempotent_client.post("/items", json={"title": "Milk"})
    await idempotent_client.post("/items", json={"title": "Milk"})
    assert endpoint.calls == 2

  @pytest.mark.asyncio
  async def test_reusing_a_key_for_a_different_request_is_rejected(self, idempotent_client: AsyncClient, endpoint: Endpoint) -> None:
    key = str(uuid4())
    await idempotent_client.post("/items", json={"title": "Milk"}, headers={IDEMPOTENCY_HEADER: key})
    response = await idempotent_client.post("/items", json={"title": "Eggs"}, headers={IDEMPOTENCY_HEADER: key})

    assert response.status_code == 422
    assert endpoint.calls == 1

  @pytest.mark.asyncio
  async def test_keys_are_scoped_to_the_account(self, idempotent_client: AsyncClient, endpoint: Endpoint) -> None:
    key = str(uuid4())
    await idempotent_client.post("/items", json={"title": "Milk"}, headers={IDEMPOTENCY_HEADER: key})
    response = await idempotent_client.post("/items", json={"title": "Milk"}, headers={IDEMPOTENCY_HEADER: key, "x-account": "bob"})

    assert REPLAYED_HEADER not in response.headers
    assert endpoint.calls == 2

  @pytest.mark.asyncio
  async def test_unauthenticated_requests_are_not_stored(self, idempotent_client: AsyncClient, endpoint: Endpoint) -> None:
    key = str(uuid4())
    for _ in range(2):
      await idempotent_client.post("/items", json={"title": "Milk"}, headers={IDEMPOTENCY_HEADER: key, "x-account": ""})
    assert endpoint.calls == 2

  @pytest.mark.asyncio
  async def test_failures_are_not_stored_so_a_retry_runs_again(self, idempotent_client: AsyncClient, endpoint: Endpoint) -> None:
    key = str(uuid4())
    endpoint.fail_with = 503
    failed = await idempotent_client.post("/items", json={"title": "Milk"}, headers={IDEMPOTENCY_HEADER: key})
    endpoint.fail_with = None
    retried = await idempotent_client.post("/items", json={"title": "Milk"}, headers={IDEMPOTENCY_HEADER: key})

    assert failed.status_code == 503
    assert retried.status_code == 201
    assert endpoint.calls == 2

  @pytest.mark.asyncio
  async def test_a_request_still_running_answers_409(self, idempotent_client: AsyncClient, endpoint: Endpoint, redis: Redis) -> None:
    key = str(uuid4())
    await idempotent_client.post("/items", json={"title": "Milk"}, headers={IDEMPOTENCY_HEADER: key})
    [stored_key] = await redis.keys(f"idempotency:*:{key}")
    record = json.loads(await redis.get(stored_key) or "{}")
    await redis.set(stored_key, json.dumps({"state": "in_progress", "fingerprint": record["fingerprint"]}), ex=60)

    response = await idempotent_client.post("/items", json={"title": "Milk"}, headers={IDEMPOTENCY_HEADER: key})

    assert response.status_code == 409
    assert response.headers["Retry-After"] == "1"
    assert endpoint.calls == 1

  @pytest.mark.asyncio
  async def test_overlong_keys_are_rejected(self, idempotent_client: AsyncClient, endpoint: Endpoint) -> None:
    response = await idempotent_client.post("/items", json={"title": "Milk"}, headers={IDEMPOTENCY_HEADER: "k" * 129})
    assert response.status_code == 400
    assert endpoint.calls == 0


class TestClientDiagnostics:
  @pytest.mark.asyncio
  async def test_accepts_reports(self, client: AsyncClient) -> None:
    response = await client.post(
      "/v1/client-diagnostics",
      json={"platform": "ios", "version": "1.0", "build": "42", "payloads": [{"crashDiagnostics": [{"diagnosticMetaData": {}}]}]},
    )
    assert response.status_code == 202

  @pytest.mark.asyncio
  async def test_limits_the_number_of_reports(self, client: AsyncClient) -> None:
    response = await client.post(
      "/v1/client-diagnostics",
      json={"platform": "ios", "version": "1.0", "build": "42", "payloads": [{}] * 11},
    )
    assert response.status_code == 422
