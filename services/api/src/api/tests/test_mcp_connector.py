import pytest
from api.settings import settings
from httpx import AsyncClient


class TestMCPConnector:
  @pytest.mark.asyncio
  async def test_is_the_servers_public_mcp_address(self, client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "MCP_RESOURCE_URL", "https://api.example.com/mcp")

    resp = await client.get("/v1/mcp-connector")

    assert resp.status_code == 200
    assert resp.json() == {"url": "https://api.example.com/mcp"}
