from typing import Any

import pytest
from api.rate_limit import _authenticate


def scope(path: str, *, authorization: str | None = None, ip: str = "160.79.104.10") -> dict[str, Any]:
  headers = [(b"x-real-ip", ip.encode())]
  if authorization:
    headers.append((b"authorization", authorization.encode()))
  return {"type": "http", "path": path, "headers": headers, "client": ("10.0.0.2", 1234)}


class TestRateLimitKey:
  @pytest.mark.asyncio
  async def test_mcp_calls_from_one_address_count_per_access_token(self) -> None:
    # Every Claude user's calls come from Anthropic's addresses.
    first, _ = await _authenticate(scope("/mcp", authorization="Bearer token-a"))
    second, _ = await _authenticate(scope("/mcp", authorization="Bearer token-b"))
    again, _ = await _authenticate(scope("/mcp", authorization="bearer token-a"))
    assert first != second
    assert first == again
    assert "token-a" not in first

  @pytest.mark.asyncio
  async def test_mcp_calls_without_a_token_and_the_rest_api_count_per_address(self) -> None:
    assert (await _authenticate(scope("/mcp")))[0] == "160.79.104.10"
    assert (await _authenticate(scope("/v1/tasks", authorization="Bearer token-a")))[0] == "160.79.104.10"
