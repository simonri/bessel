import pytest
from api.tests.fixtures.mcp import ConnectFixture, mcp_call, mcp_call_error

TZ = {"timezone": "Europe/Stockholm"}


async def _add(connect: ConnectFixture, *goals: dict, token: str = "token-a") -> list[dict]:
  return (await mcp_call(connect, "add_goals", {"goals": list(goals)}, token=token))["goals"]


class TestGoalTools:
  @pytest.mark.asyncio
  async def test_add_check_in_and_score(self, connect: ConnectFixture) -> None:
    [reading, sleep] = await _add(
      connect,
      {"title": "Read", "metric": "manual", "target": 3},
      {"title": "Asleep by 00:30", "metric": "sleep_before", "params": {"time": "00:30"}, "target": 5},
    )
    assert (await mcp_call(connect, "check_in_goals", {"check_ins": [{"goal_id": reading["id"]}], **TZ}))["checked_in"] == 1
    assert "measured from the user's data" in await mcp_call_error(connect, "check_in_goals", {"check_ins": [{"goal_id": sleep["id"]}], **TZ})

    board = await mcp_call(connect, "get_goal_scoreboard", TZ)
    by_title = {s["goal"]["title"]: s for s in board["goals"]}
    assert by_title["Read"]["current"]["value"] == 1
    assert by_title["Asleep by 00:30"]["measured"] is False

    [changed] = (await mcp_call(connect, "update_goals", {"changes": [{"goal_id": reading["id"], "target": 4}]}))["goals"]
    assert changed["target"] == 4

  @pytest.mark.asyncio
  async def test_private_goals_only_when_asked_for(self, connect: ConnectFixture) -> None:
    await _add(connect, {"title": "Mine alone", "metric": "manual", "target": 3, "comparison": "at_most", "sensitivity": "private"})
    assert (await mcp_call(connect, "get_goal_scoreboard", TZ))["goals"] == []
    assert len((await mcp_call(connect, "get_goal_scoreboard", {"include_private": True, **TZ}))["goals"]) == 1

  @pytest.mark.asyncio
  async def test_another_user_cant_see_change_or_check_in(self, connect: ConnectFixture) -> None:
    [mine] = await _add(connect, {"title": "Read", "metric": "manual", "target": 3})

    assert (await mcp_call(connect, "get_goal_scoreboard", {"include_private": True, **TZ}, token="token-b"))["goals"] == []
    assert "No goal" in await mcp_call_error(connect, "update_goals", {"changes": [{"goal_id": mine["id"], "title": "x"}]}, token="token-b")
    assert "No goal" in await mcp_call_error(connect, "check_in_goals", {"check_ins": [{"goal_id": mine["id"]}], **TZ}, token="token-b")
    theirs = await _add(connect, {"title": "Theirs", "metric": "manual", "target": 1}, token="token-b")
    assert [g["title"] for g in theirs] == ["Theirs"]
    assert [s["goal"]["title"] for s in (await mcp_call(connect, "get_goal_scoreboard", TZ))["goals"]] == ["Read"]
