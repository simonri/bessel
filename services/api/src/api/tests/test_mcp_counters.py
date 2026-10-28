from datetime import UTC, datetime, timedelta

import pytest
from api.common.utils import utc_now
from api.models.counter import Counter, CounterReset
from api.tests.fixtures.database import SaveFixture
from api.tests.fixtures.mcp import ConnectFixture, mcp_call
from pytest_mock import MockerFixture

NOW = datetime(2026, 10, 28, 12, tzinfo=UTC)


class TestGetCounters:
  @pytest.mark.asyncio
  async def test_days_since_the_last_reset_and_the_recent_ones(self, connect: ConnectFixture, save_owned: SaveFixture, mocker: MockerFixture) -> None:
    mocker.patch("api.mcp.tools.counters.utc_now", return_value=NOW)
    coffee = Counter(name="Coffee", created_at=NOW - timedelta(days=100))
    snooze = Counter(name="Snoozed alarm", created_at=NOW - timedelta(days=3))
    await save_owned(coffee)
    await save_owned(snooze)
    await save_owned(Counter(name="Gone", deleted_at=utc_now()))
    # Seven resets, a day apart, the newest 2 days and 1 hour ago, plus a reset that was undone.
    for days_ago in range(2, 9):
      await save_owned(CounterReset(counter_id=coffee.id, created_at=NOW - timedelta(days=days_ago, hours=1)))
    await save_owned(CounterReset(counter_id=coffee.id, created_at=NOW - timedelta(hours=1), deleted_at=utc_now()))

    counters = (await mcp_call(connect, "get_counters", {"timezone": "Europe/Stockholm"}))["counters"]

    assert [c["name"] for c in counters] == ["Coffee", "Snoozed alarm"]
    first, second = counters
    assert (first["days_since"], first["reset_count"], first["last_reset_at"]) == (2, 7, "2026-10-26T12:00:00+01:00")
    assert first["recent_resets"] == [
      "2026-10-26T12:00:00+01:00",
      "2026-10-25T12:00:00+01:00",
      "2026-10-24T13:00:00+02:00",
      "2026-10-23T13:00:00+02:00",
      "2026-10-22T13:00:00+02:00",
    ]
    assert (second["days_since"], second["reset_count"], second["last_reset_at"], second["recent_resets"]) == (None, 0, None, [])
    assert second["created_at"] == "2026-10-25T13:00:00+01:00"

    assert (await mcp_call(connect, "get_counters", {"timezone": "Europe/Stockholm"}, token="token-b"))["counters"] == []
