from datetime import UTC, date, datetime

import pytest
from api.models.agent_usage_daily import AgentUsageDaily
from api.models.agent_usage_status import AgentUsageStatus
from api.tests.fixtures.database import SaveFixture
from api.tests.fixtures.mcp import ConnectFixture, mcp_call, mcp_call_error


def _usage(day: date, model: str, tokens: int, *, device: str = "laptop", agent: str = "claude-code") -> AgentUsageDaily:
  return AgentUsageDaily(
    device=device,
    agent=agent,
    date=day,
    model=model,
    input_tokens=tokens,
    output_tokens=tokens * 2,
    cache_read_tokens=tokens * 10,
    cache_creation_tokens=tokens // 10,
  )


class TestGetAgentUsage:
  @pytest.mark.asyncio
  async def test_tokens_per_day_and_model_with_rate_limits(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    await save_owned(_usage(date(2026, 10, 3), "claude-opus", 100))
    await save_owned(_usage(date(2026, 10, 4), "claude-opus", 200))
    await save_owned(_usage(date(2026, 10, 4), "claude-sonnet", 1000, device="desktop"))
    await save_owned(_usage(date(2026, 10, 1), "claude-opus", 5000))
    resets = datetime(2026, 10, 4, 15, tzinfo=UTC)
    await save_owned(
      AgentUsageStatus(device="laptop", agent="claude-code", window_label="session_5h", utilization_pct=42.5, resets_at=resets, tier="max", observed_at=resets)
    )

    usage = await mcp_call(connect, "get_agent_usage", {"start": "2026-10-03", "end": "2026-10-04", "timezone": "UTC"})

    assert usage["total"] == {"input_tokens": 1300, "output_tokens": 2600, "cache_read_tokens": 13000, "cache_creation_tokens": 130}
    assert [(d["date"], d["input_tokens"], d["output_tokens"]) for d in usage["days"]] == [("2026-10-03", 100, 200), ("2026-10-04", 1200, 2400)]
    assert [(m["agent"], m["model"], m["input_tokens"], m["cache_read_tokens"]) for m in usage["models"]] == [
      ("claude-code", "claude-sonnet", 1000, 10000),
      ("claude-code", "claude-opus", 300, 3000),
    ]
    assert usage["devices"] == ["desktop", "laptop"]
    assert usage["rate_limits"] == [
      {
        "device": "laptop",
        "agent": "claude-code",
        "window": "session_5h",
        "utilization_pct": 42.5,
        "resets_at": "2026-10-04T15:00:00Z",
        "tier": "max",
        "observed_at": "2026-10-04T15:00:00Z",
      }
    ]

    other = await mcp_call(connect, "get_agent_usage", {"start": "2026-10-01", "end": "2026-10-04", "timezone": "UTC"}, token="token-b")
    assert other == {
      "total": {"input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0, "cache_creation_tokens": 0},
      "days": [],
      "models": [],
      "devices": [],
      "rate_limits": [],
    }

  @pytest.mark.asyncio
  async def test_a_range_over_three_months_is_refused(self, connect: ConnectFixture) -> None:
    message = await mcp_call_error(connect, "get_agent_usage", {"start": "2026-01-01", "end": "2026-10-04", "timezone": "UTC"})
    assert "at most 92 days" in message
