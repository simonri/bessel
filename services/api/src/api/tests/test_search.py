from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from api.models.calendar import Calendar
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.calendar_event import CalendarEvent
from api.models.user import User
from api.tests.fixtures.database import SaveFixture
from httpx import AsyncClient


async def _create(client: AsyncClient, path: str, body: dict[str, Any]) -> dict[str, Any]:
  resp = await client.post(path, json=body)
  assert resp.status_code in (200, 201), resp.text
  return resp.json()


async def _calendar(save_fixture: SaveFixture, user: User, *, hidden: bool = False) -> Calendar:
  account = CalendarAccount(
    user_id=user.id, provider=CalendarProvider.google, email=f"{'hidden' if hidden else 'main'}@example.com", encrypted_credentials="not-used"
  )
  await save_fixture(account)
  calendar = Calendar(account_id=account.id, external_id=f"cal-{hidden}", name="Calendar", color="#3b82f6", hidden=hidden)
  await save_fixture(calendar)
  return calendar


async def _event(save_fixture: SaveFixture, calendar: Calendar, title: str, start: datetime) -> CalendarEvent:
  event = CalendarEvent(
    calendar_id=calendar.id, external_id=f"evt-{title}-{start.isoformat()}", title=title, all_day=False, start_at=start, end_at=start + timedelta(hours=1)
  )
  await save_fixture(event)
  return event


class TestSearch:
  @pytest.mark.asyncio
  async def test_finds_each_kind_by_text(self, client: AsyncClient, user: User, save_fixture: SaveFixture) -> None:
    task = await _create(client, "/v1/tasks", {"title": "Book dentist", "position": 1.0})
    await _create(client, "/v1/tasks", {"title": "Groceries", "description": "ask the dentist about floss", "position": 2.0})
    recipe = await _create(client, "/v1/recipes", {"title": "Dentist-approved granola", "content": "oats"})
    place = await _create(client, "/v1/places", {"name": "Smile clinic", "address": "Dentist street 4", "latitude": 59.9, "longitude": 10.7})
    calendar = await _calendar(save_fixture, user)
    event = await _event(save_fixture, calendar, "Dentist", datetime.now(UTC) + timedelta(days=2))

    resp = await client.get("/v1/search", params={"q": "dentist"})
    assert resp.status_code == 200
    body = resp.json()
    assert {t["title"] for t in body["tasks"]} == {"Book dentist", "Groceries"}
    assert task["id"] in {t["id"] for t in body["tasks"]}
    assert [r["id"] for r in body["recipes"]] == [recipe["id"]]
    assert [p["id"] for p in body["places"]] == [place["id"]]
    assert [e["id"] for e in body["events"]] == [str(event.id)]

  @pytest.mark.asyncio
  async def test_events_closest_to_now_first_and_hidden_calendars_left_out(self, client: AsyncClient, user: User, save_fixture: SaveFixture) -> None:
    calendar = await _calendar(save_fixture, user)
    hidden = await _calendar(save_fixture, user, hidden=True)
    now = datetime.now(UTC)
    far = await _event(save_fixture, calendar, "Standup", now - timedelta(days=30))
    near = await _event(save_fixture, calendar, "Standup", now + timedelta(days=1))
    await _event(save_fixture, hidden, "Standup", now)

    body = (await client.get("/v1/search", params={"q": "standup"})).json()
    assert [e["id"] for e in body["events"]] == [str(near.id), str(far.id)]

  @pytest.mark.asyncio
  async def test_other_users_see_nothing(self, client: AsyncClient, other_client: AsyncClient) -> None:
    await _create(client, "/v1/tasks", {"title": "A's secret plan", "position": 1.0})

    body = (await other_client.get("/v1/search", params={"q": "secret"})).json()
    assert body == {"tasks": [], "recipes": [], "events": [], "places": []}

  @pytest.mark.asyncio
  async def test_needs_two_characters(self, client: AsyncClient) -> None:
    assert (await client.get("/v1/search", params={"q": "a"})).status_code == 422
