from collections.abc import AsyncIterator

import pytest
from api import middlewares
from httpx import AsyncClient


class TestBodySizeLimit:
  @pytest.mark.asyncio
  async def test_a_body_over_the_limit_is_refused_before_it_is_read(self, client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(middlewares, "MAX_BODY_BYTES", 1_000)

    refused = await client.post("/v1/tasks", content=b"x" * 2_000, headers={"Content-Type": "application/json"})
    assert refused.status_code == 413

    allowed = await client.post("/v1/tasks", json={"title": "Small enough"})
    assert allowed.status_code < 400

  @pytest.mark.asyncio
  async def test_a_streamed_body_stops_at_the_limit(self, client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    # Without a Content-Length nothing can be refused up front; reading must still stop at the limit.
    monkeypatch.setattr(middlewares, "MAX_BODY_BYTES", 1_000)

    async def chunks() -> AsyncIterator[bytes]:
      # Valid JSON, so only the limit can turn it away.
      yield b'{"title": "Streamed", "description": "'
      for _ in range(30):
        yield b"x" * 100
      yield b'"}'

    response = await client.post("/v1/tasks", content=chunks(), headers={"Content-Type": "application/json"})
    assert response.status_code >= 400
    assert (await client.get("/v1/tasks")).json()["items"] == []
