from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from api.goals import reflections
from api.goals.reflections import QUESTIONS, Window, ask_if_due, next_question, should_ask, waking_window
from api.models.goal import GoalPlan, Reflection
from api.models.notification import Notification
from api.models.user import User
from httpx import AsyncClient
from pytest_mock import MockerFixture
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

STOCKHOLM = ZoneInfo("Europe/Stockholm")
DAY = datetime(2026, 11, 4, tzinfo=STOCKHOLM)
WINDOW = Window(DAY.replace(hour=10), DAY.replace(hour=21))


class TestWhenToAsk:
  def test_the_window_follows_the_users_sleep(self) -> None:
    # Usually up at 12:00 and asleep at 04:00: questions from 12:30 to 03:00.
    window = waking_window(DAY, [720, 720, 730], [1680, 1680, 1690], STOCKHOLM)
    assert (window.start.strftime("%H:%M"), window.end.strftime("%d %H:%M")) == ("12:30", "05 03:00")
    assert waking_window(DAY, [], [], STOCKHOLM) == WINDOW

  def test_only_inside_the_window_and_never_twice_within_45_minutes(self) -> None:
    always = lambda: 0.0  # noqa: E731
    assert should_ask(DAY.replace(hour=12), WINDOW, 3, [], always)
    assert not should_ask(DAY.replace(hour=8), WINDOW, 3, [], always)
    assert not should_ask(DAY.replace(hour=12), WINDOW, 3, [DAY.replace(hour=11, minute=30)], always)
    assert not should_ask(DAY.replace(hour=12), WINDOW, 0, [], always)

  def test_stops_at_the_days_count_and_catches_up_before_the_end(self) -> None:
    asked = [DAY.replace(hour=11), DAY.replace(hour=13)]
    assert not should_ask(DAY.replace(hour=15), WINDOW, 2, asked, lambda: 0.0)
    # Early in the day a high draw waits; in the last quarter hour one still owed always comes.
    assert not should_ask(DAY.replace(hour=11), WINDOW, 1, [], lambda: 0.9)
    assert should_ask(DAY.replace(hour=20, minute=50), WINDOW, 1, [], lambda: 0.99)

  def test_asks_the_question_asked_longest_ago(self) -> None:
    assert next_question([]) == QUESTIONS[0]
    assert next_question(list(QUESTIONS[:3])) == QUESTIONS[3]
    assert next_question([*QUESTIONS[1:], QUESTIONS[0]]) == QUESTIONS[1]


class TestAsking:
  @pytest.mark.asyncio
  async def test_a_question_is_asked_with_a_notification(self, session: AsyncSession, user: User, mocker: MockerFixture) -> None:
    mocker.patch.object(reflections, "utc_now", return_value=DAY.replace(hour=12).astimezone(UTC))
    plan = GoalPlan(user_id=user.id, questions_per_day=2)
    session.add(plan)
    await session.flush()

    asked = await ask_if_due(session, plan, STOCKHOLM, [], draw=lambda: 0.0)

    assert asked is not None and asked.question == QUESTIONS[0]
    [note] = (await session.execute(select(Notification).where(Notification.user_id == user.id))).scalars().all()
    assert (note.title, note.link) == (QUESTIONS[0], "/goals")
    # Straight after, the 45 minutes between questions holds.
    assert await ask_if_due(session, plan, STOCKHOLM, [asked], draw=lambda: 0.0) is None


class TestAnswering:
  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_list_answer_and_turn_on(self, client: AsyncClient, session: AsyncSession, user: User) -> None:
    session.add(Reflection(user_id=user.id, question=QUESTIONS[0], asked_at=datetime.now(UTC) - timedelta(hours=1), context={"hours": 2, "apps": []}))
    await session.flush()

    [open_question] = (await client.get("/v1/goals/reflections", params={"unanswered": True})).json()
    answered = (await client.put(f"/v1/goals/reflections/{open_question['id']}", json={"answer": " The tax return "})).json()
    assert (answered["answer"], answered["answered_at"] is not None) == ("The tax return", True)
    assert (await client.get("/v1/goals/reflections", params={"unanswered": True})).json() == []

    assert (await client.put("/v1/goals/plan", json={"questions_per_day": 3})).json()["questions_per_day"] == 3
    assert (await client.put("/v1/goals/plan", json={"questions_per_day": 9})).status_code == 422
