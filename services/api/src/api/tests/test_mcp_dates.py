from datetime import date
from zoneinfo import ZoneInfo

import pytest
from api.mcp.dates import parse_day, resolve_timezone
from api.models.user import User
from httpx import AsyncClient
from mcp.server.mcpserver.exceptions import ToolError

WEDNESDAY = date(2026, 10, 7)


class TestParseDay:
  @pytest.mark.parametrize(
    ("text", "expected"),
    [
      ("2026-12-24", date(2026, 12, 24)),
      ("today", WEDNESDAY),
      ("Tomorrow", date(2026, 10, 8)),
      ("yesterday", date(2026, 10, 6)),
      ("fri", date(2026, 10, 9)),
      ("on friday", date(2026, 10, 9)),
      ("wed", date(2026, 10, 14)),
      ("next week", date(2026, 10, 12)),
      ("in 3 days", date(2026, 10, 10)),
      ("in 2 weeks", date(2026, 10, 21)),
      ("2 days ago", date(2026, 10, 5)),
      ("last monday", date(2026, 10, 5)),
      ("last wednesday", date(2026, 9, 30)),
    ],
  )
  def test_reads_iso_and_relative_days(self, text: str, expected: date) -> None:
    assert parse_day(text, WEDNESDAY) == expected

  def test_rejects_unknown_phrases_with_the_accepted_formats(self) -> None:
    with pytest.raises(ToolError, match="YYYY-MM-DD"):
      parse_day("whenever", WEDNESDAY)


class TestResolveTimezone:
  def test_prefers_the_argument_then_the_stored_timezone(self) -> None:
    user = User(auth0_sub="x", timezone="Europe/Stockholm")
    assert resolve_timezone(user, None) == ZoneInfo("Europe/Stockholm")
    assert resolve_timezone(user, "Asia/Tokyo") == ZoneInfo("Asia/Tokyo")

  def test_asks_for_a_timezone_when_none_is_known(self) -> None:
    with pytest.raises(ToolError, match="Pass `timezone`"):
      resolve_timezone(User(auth0_sub="x"), None)


class TestMeTimezone:
  @pytest.mark.asyncio
  async def test_apps_can_report_the_users_timezone(self, client: AsyncClient) -> None:
    resp = await client.patch("/v1/auth/me", json={"timezone": "Europe/Stockholm"})
    assert resp.status_code == 200
    assert resp.json()["timezone"] == "Europe/Stockholm"
    assert (await client.get("/v1/auth/me")).json()["timezone"] == "Europe/Stockholm"

  @pytest.mark.asyncio
  async def test_rejects_unknown_timezones(self, client: AsyncClient) -> None:
    assert (await client.patch("/v1/auth/me", json={"timezone": "Mars/Olympus"})).status_code == 422
