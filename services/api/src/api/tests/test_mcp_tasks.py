import pytest
from api.models.task import Task
from api.tests.fixtures.database import SaveFixture
from api.tests.fixtures.mcp import ConnectFixture, mcp_call, mcp_call_error


class TestTasks:
  @pytest.mark.asyncio
  async def test_filters_by_status_and_text(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    await save_owned(Task(title="Renew passport", description="Book a time", status="todo", area="Personal"))
    await save_owned(Task(title="File taxes", status="done", area="Personal"))

    todo = await mcp_call(connect, "search_tasks", {"status": ["todo"]})
    assert [t["title"] for t in todo["tasks"]] == ["Renew passport"]
    assert (await mcp_call(connect, "search_tasks", {"search": "book"}))["total_count"] == 1
    assert (await mcp_call(connect, "search_tasks", {"area": "Work"}))["tasks"] == []

  @pytest.mark.asyncio
  async def test_other_user_cannot_see_tasks(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    task = Task(title="A's task", status="todo")
    await save_owned(task)

    assert (await mcp_call(connect, "search_tasks", token="token-b"))["tasks"] == []
    assert await mcp_call_error(connect, "get_task", {"task_id": str(task.id)}, token="token-b") == "Task not found."
