from collections.abc import Callable, Coroutine
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio
from api.models.project import Project
from api.models.task import Task
from api.models.user import User
from api.postgres import AsyncSession
from api.tests.fixtures.database import SaveFixture
from api.tests.fixtures.mcp import ConnectFixture, mcp_call, mcp_call_error
from sqlalchemy import select

TZ = "Europe/Stockholm"

MakeTask = Callable[..., Coroutine[None, None, Task]]


def _today() -> date:
  return datetime.now(ZoneInfo(TZ)).date()


@pytest_asyncio.fixture
async def stockholm_user(user: User, session: AsyncSession) -> User:
  user.timezone = TZ
  await session.flush()
  return user


@pytest_asyncio.fixture
async def bessel(save_owned: SaveFixture) -> Project:
  project = Project(name="Bessel", path="/home/me/dev/bessel")
  await save_owned(project)
  return project


@pytest_asyncio.fixture
async def make_task(save_owned: SaveFixture) -> MakeTask:
  async def _make(title: str, **fields: Any) -> Task:
    project: Project | None = fields.pop("project", None)
    task = Task(title=title, status=fields.pop("status", "todo"), priority=fields.pop("priority", 0), position=fields.pop("position", 0), **fields)
    if project is not None:
      task.project_id = project.id
    await save_owned(task)
    return task

  return _make


class TestOverview:
  @pytest.mark.asyncio
  async def test_groups_open_work_like_the_today_view(self, connect: ConnectFixture, stockholm_user: User, bessel: Project, make_task: MakeTask) -> None:
    today = _today()
    await make_task("Write release notes", status="in_progress", project=bessel)
    await make_task("Renew passport", due_date=today - timedelta(days=3), tags=["errand"])
    await make_task("Call the dentist", due_date=today)
    await make_task("Fix sync bug", due_date=today + timedelta(days=2), priority=4, project=bessel)
    await make_task("Plan trip", due_date=today + timedelta(days=30))
    await make_task("Someday idea")
    await make_task("Water plants", due_date=today, is_recurring=True, rrule_frequency="weekly")
    await make_task("Old thing", status="done")

    overview = await mcp_call(connect, "get_task_overview")
    assert overview["today"] == today.isoformat()
    assert overview["timezone"] == TZ
    assert [t["title"] for t in overview["in_progress"]] == ["Write release notes"]
    assert [(t["title"], t["due_label"]) for t in overview["overdue"]] == [("Renew passport", "overdue by 3 days")]
    assert [t["title"] for t in overview["due_today"]] == ["Call the dentist"]
    assert [(t["title"], t["priority"]) for t in overview["next_6_days"]] == [("Fix sync bug", "urgent")]
    assert [(t["title"], t["repeats"]) for t in overview["routines_due"]] == [("Water plants", "every week")]
    assert overview["counts"] == {"open": 6, "in_progress": 1, "overdue": 1, "due_today": 1, "next_6_days": 1, "later": 1, "no_due_date": 1}
    assert overview["projects"] == [{"name": "Bessel", "open_tasks": 2}]
    assert overview["tags"] == ["errand"]

  @pytest.mark.asyncio
  async def test_other_user_sees_nothing(self, connect: ConnectFixture, stockholm_user: User, make_task: MakeTask) -> None:
    await make_task("A's task", due_date=_today())
    overview = await mcp_call(connect, "get_task_overview", {"timezone": TZ}, token="token-b")
    assert overview["due_today"] == []
    assert overview["counts"]["open"] == 0

  @pytest.mark.asyncio
  async def test_asks_for_a_timezone_when_none_is_known(self, connect: ConnectFixture, user: User) -> None:
    assert "Pass `timezone`" in await mcp_call_error(connect, "get_task_overview", {})


class TestFindTasks:
  @pytest.mark.asyncio
  async def test_filters_by_loose_project_due_window_and_priority(
    self, connect: ConnectFixture, stockholm_user: User, bessel: Project, make_task: MakeTask
  ) -> None:
    today = _today()
    await make_task("Fix sync bug", due_date=today + timedelta(days=1), priority=4, project=bessel)
    await make_task("Polish docs", due_date=today + timedelta(days=2), priority=1, project=bessel)
    await make_task("Buy milk", due_date=today + timedelta(days=1))

    urgent = await mcp_call(connect, "find_tasks", {"project": "bess", "due": "next_7_days", "min_priority": "high"})
    assert [t["title"] for t in urgent["tasks"]] == ["Fix sync bug"]
    tomorrow = await mcp_call(connect, "find_tasks", {"due": "tomorrow"})
    assert sorted(t["title"] for t in tomorrow["tasks"]) == ["Buy milk", "Fix sync bug"]

  @pytest.mark.asyncio
  async def test_unknown_project_lists_the_real_ones(self, connect: ConnectFixture, stockholm_user: User, bessel: Project) -> None:
    message = await mcp_call_error(connect, "find_tasks", {"project": "Uni"})
    assert "Bessel" in message

  @pytest.mark.asyncio
  async def test_detailed_includes_notes_and_concise_leaves_them_out(self, connect: ConnectFixture, stockholm_user: User, make_task: MakeTask) -> None:
    await make_task("Renew passport", description="Book at the police station")
    concise = await mcp_call(connect, "find_tasks", {"search": "passport"})
    detailed = await mcp_call(connect, "find_tasks", {"search": "passport", "response_format": "detailed"})
    assert concise["tasks"][0]["notes"] is None
    assert detailed["tasks"][0]["notes"] == "Book at the police station"

  @pytest.mark.asyncio
  async def test_other_user_sees_nothing(self, connect: ConnectFixture, stockholm_user: User, make_task: MakeTask) -> None:
    task = await make_task("A's secret task")
    assert (await mcp_call(connect, "find_tasks", {"timezone": TZ}, token="token-b"))["tasks"] == []
    assert await mcp_call_error(connect, "get_task", {"task_id": str(task.id), "timezone": TZ}, token="token-b") == "Task not found."


class TestCompletedTasks:
  @pytest.mark.asyncio
  async def test_counts_completed_work_per_project(self, connect: ConnectFixture, stockholm_user: User, bessel: Project, make_task: MakeTask) -> None:
    now = datetime.now(UTC)
    await make_task("Ship MCP", status="done", completed_at=now - timedelta(days=1), project=bessel)
    await make_task("Fix login", status="done", completed_at=now - timedelta(days=2), project=bessel)
    await make_task("Laundry", status="done", completed_at=now - timedelta(hours=1))
    await make_task("Ancient", status="done", completed_at=now - timedelta(days=40))

    week = await mcp_call(connect, "find_completed_tasks", {})
    assert week["total_count"] == 3
    assert week["per_project"] == {"Bessel": 2, "(no project)": 1}
    assert [t["title"] for t in week["tasks"]] == ["Laundry", "Ship MCP", "Fix login"]
    assert (await mcp_call(connect, "find_completed_tasks", {"timezone": TZ}, token="token-b"))["total_count"] == 0


class TestAddTasks:
  @pytest.mark.asyncio
  async def test_adds_a_batch_with_relative_days_and_routines(self, connect: ConnectFixture, stockholm_user: User, bessel: Project) -> None:
    result = await mcp_call(
      connect,
      "add_tasks",
      {
        "tasks": [
          {"title": "Renew passport", "due": "tomorrow", "priority": "high"},
          {"title": "Fix sync bug", "project": "bessel", "tags": ["bug"]},
          {"title": "Take out recycling", "repeat": {"every": "week", "weekday": "mon"}},
        ]
      },
    )
    created = {t["title"]: t for t in result["created"]}
    assert created["Renew passport"]["due"] == (_today() + timedelta(days=1)).isoformat()
    assert created["Renew passport"]["priority"] == "high"
    assert created["Fix sync bug"]["project"] == "Bessel"
    assert created["Take out recycling"]["repeats"] == "every week on Mon"

  @pytest.mark.asyncio
  async def test_retrying_the_same_add_does_not_duplicate(self, connect: ConnectFixture, stockholm_user: User, session: AsyncSession) -> None:
    args = {"tasks": [{"title": "Call mum"}]}
    await mcp_call(connect, "add_tasks", args)
    retry = await mcp_call(connect, "add_tasks", args)
    assert retry["created"] == []
    assert [t["title"] for t in retry["already_existed"]] == ["Call mum"]
    assert len((await session.execute(select(Task).where(Task.title == "Call mum"))).scalars().all()) == 1

  @pytest.mark.asyncio
  async def test_unknown_project_creates_nothing_unless_asked(self, connect: ConnectFixture, stockholm_user: User, session: AsyncSession) -> None:
    error = await mcp_call_error(connect, "add_tasks", {"tasks": [{"title": "First"}, {"title": "Essay", "project": "Uni"}]})
    assert "new_project" in error
    assert (await session.execute(select(Task).where(Task.title == "First"))).scalar_one_or_none() is None

    result = await mcp_call(connect, "add_tasks", {"tasks": [{"title": "Essay", "project": "Uni", "new_project": True}]})
    assert result["created"][0]["project"] == "Uni"

  @pytest.mark.asyncio
  async def test_tasks_belong_to_the_caller(self, connect: ConnectFixture, stockholm_user: User) -> None:
    await mcp_call(connect, "add_tasks", {"tasks": [{"title": "B's task"}], "timezone": TZ}, token="token-b")
    assert (await mcp_call(connect, "find_tasks", {"search": "B's task"}))["tasks"] == []


class TestUpdateTasks:
  @pytest.mark.asyncio
  async def test_reschedules_moves_and_appends_notes(self, connect: ConnectFixture, stockholm_user: User, bessel: Project, make_task: MakeTask) -> None:
    task = await make_task("Fix sync bug", description="Seen on iOS", project=bessel)
    result = await mcp_call(
      connect,
      "update_tasks",
      {"changes": [{"task_id": str(task.id), "due": "fri", "priority": "urgent", "project": "none", "append_note": "Root cause: stale token"}]},
    )
    [updated] = result["tasks"]
    assert updated["project"] is None
    assert updated["priority"] == "urgent"
    assert date.fromisoformat(updated["due"]).weekday() == 4
    detailed = await mcp_call(connect, "get_task", {"task_id": str(task.id)})
    assert detailed["notes"] == f"Seen on iOS\n\n[{_today().isoformat()}] Root cause: stale token"

  @pytest.mark.asyncio
  async def test_one_bad_id_changes_nothing(self, connect: ConnectFixture, stockholm_user: User, make_task: MakeTask) -> None:
    mine = await make_task("Mine", priority=0)
    message = await mcp_call_error(
      connect,
      "update_tasks",
      {"changes": [{"task_id": str(mine.id), "priority": "urgent"}, {"task_id": "00000000-0000-0000-0000-000000000000", "priority": "low"}]},
    )
    assert "Nothing was changed" in message
    assert (await mcp_call(connect, "get_task", {"task_id": str(mine.id)}))["priority"] == "none"

  @pytest.mark.asyncio
  async def test_other_user_cannot_change_tasks(self, connect: ConnectFixture, stockholm_user: User, make_task: MakeTask) -> None:
    task = await make_task("A's task")
    error = await mcp_call_error(connect, "update_tasks", {"changes": [{"task_id": str(task.id), "title": "pwned"}], "timezone": TZ}, token="token-b")
    assert "No task with id" in error
    assert (await mcp_call(connect, "get_task", {"task_id": str(task.id)}))["title"] == "A's task"


class TestCompleteTasks:
  @pytest.mark.asyncio
  async def test_completing_a_routine_schedules_the_next_and_undo_removes_it(
    self, connect: ConnectFixture, stockholm_user: User, make_task: MakeTask, session: AsyncSession
  ) -> None:
    today = _today()
    routine = await make_task("Water plants", due_date=today, is_recurring=True, rrule_frequency="weekly", rrule_interval=1)
    one_off = await make_task("Pay rent")

    result = await mcp_call(connect, "complete_tasks", {"task_ids": [str(routine.id), str(one_off.id)]})
    by_title = {c["task"]["title"]: c for c in result["completed"]}
    assert by_title["Pay rent"]["next_occurrence"] is None
    assert by_title["Water plants"]["next_occurrence"]["due"] == (today + timedelta(days=7)).isoformat()

    again = await mcp_call(connect, "complete_tasks", {"task_ids": [str(one_off.id)]})
    assert again["already_done"] == [str(one_off.id)]

    await mcp_call(connect, "undo_complete_tasks", {"task_ids": [str(routine.id)]})
    open_routines = (await session.execute(select(Task).where(Task.title == "Water plants", Task.status == "todo"))).scalars().all()
    assert [t.id for t in open_routines] == [routine.id]

  @pytest.mark.asyncio
  async def test_other_user_cannot_complete_tasks(self, connect: ConnectFixture, stockholm_user: User, make_task: MakeTask) -> None:
    task = await make_task("A's task")
    assert "No task with id" in await mcp_call_error(connect, "complete_tasks", {"task_ids": [str(task.id)], "timezone": TZ}, token="token-b")

  @pytest.mark.asyncio
  async def test_other_user_cannot_reopen_tasks(self, connect: ConnectFixture, stockholm_user: User, make_task: MakeTask) -> None:
    task = await make_task("A's finished task", status="done")
    assert "No task with id" in await mcp_call_error(connect, "undo_complete_tasks", {"task_ids": [str(task.id)], "timezone": TZ}, token="token-b")
    assert (await mcp_call(connect, "get_task", {"task_id": str(task.id)}))["status"] == "done"


class TestStartTask:
  @pytest.mark.asyncio
  async def test_picks_the_next_task_for_the_repo_folder(self, connect: ConnectFixture, stockholm_user: User, bessel: Project, make_task: MakeTask) -> None:
    today = _today()
    await make_task("Later work", due_date=today + timedelta(days=9), project=bessel)
    soon = await make_task("Fix sync bug", due_date=today + timedelta(days=1), description="Seen on iOS", project=bessel)
    await make_task("Other project work", due_date=today)

    started = await mcp_call(connect, "start_task", {"project_path": "/home/me/dev/bessel/services/api"})
    assert started["task"]["id"] == str(soon.id)
    assert started["task"]["status"] == "in_progress"
    assert started["project_paths"] == ["/home/me/dev/bessel"]
    assert "Seen on iOS" in started["brief"]
    assert str(soon.id) in started["brief"]

    resumed = await mcp_call(connect, "start_task", {"project": "Bessel"})
    assert resumed["task"]["id"] == str(soon.id)

  @pytest.mark.asyncio
  async def test_explains_when_nothing_matches(self, connect: ConnectFixture, stockholm_user: User, bessel: Project) -> None:
    assert "No open tasks in Bessel" in await mcp_call_error(connect, "start_task", {"project": "Bessel"})
    assert "Linked projects: Bessel" in await mcp_call_error(connect, "start_task", {"project_path": "/tmp/elsewhere"})

  @pytest.mark.asyncio
  async def test_other_user_cannot_start_tasks(self, connect: ConnectFixture, stockholm_user: User, make_task: MakeTask) -> None:
    task = await make_task("A's task")
    assert "No task with id" in await mcp_call_error(connect, "start_task", {"task_id": str(task.id), "timezone": TZ}, token="token-b")


class TestPrompts:
  @pytest.mark.asyncio
  async def test_planning_prompts_are_offered(self, connect: ConnectFixture) -> None:
    async with connect() as client:
      prompts = {p.name for p in (await client.list_prompts()).prompts}
      daily = await client.get_prompt("daily-plan")
    assert {"daily-plan", "weekly-review"} <= prompts
    assert "get_task_overview" in daily.messages[0].content.text  # type: ignore[union-attr]
