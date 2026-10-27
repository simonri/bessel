import pytest
from api.tests.fixtures.mcp import ConnectFixture, mcp_call, mcp_call_error


class TestNotes:
  @pytest.mark.asyncio
  async def test_a_key_never_saved_is_empty(self, connect: ConnectFixture) -> None:
    note = await mcp_call(connect, "get_note", {"key": "morgonrapport"})
    assert note == {"key": "morgonrapport", "content": "", "updated_at": None}

  @pytest.mark.asyncio
  async def test_saving_replaces_the_note_and_only_the_user_sees_it(self, connect: ConnectFixture) -> None:
    await mcp_call(connect, "save_note", {"key": "morgonrapport", "content": "Sömnsteg 1, streak 0"})
    await mcp_call(connect, "save_note", {"key": "morgonrapport", "content": "Sömnsteg 1, streak 1\nNej tack: Fars dag"})
    await mcp_call(connect, "save_note", {"key": "other", "content": "separate"})

    note = await mcp_call(connect, "get_note", {"key": "morgonrapport"})
    assert note["content"] == "Sömnsteg 1, streak 1\nNej tack: Fars dag"
    assert note["updated_at"] is not None

    assert (await mcp_call(connect, "get_note", {"key": "morgonrapport"}, token="token-b"))["content"] == ""
    await mcp_call(connect, "save_note", {"key": "morgonrapport", "content": "user b"}, token="token-b")
    assert (await mcp_call(connect, "get_note", {"key": "morgonrapport"}))["content"] == "Sömnsteg 1, streak 1\nNej tack: Fars dag"

  @pytest.mark.asyncio
  @pytest.mark.parametrize("key", ["Morgonrapport", "morgon rapport", "", "-x"])
  async def test_keys_are_lowercase_words(self, connect: ConnectFixture, key: str) -> None:
    message = await mcp_call_error(connect, "save_note", {"key": key, "content": "x"})
    assert "key" in message

  @pytest.mark.asyncio
  async def test_a_note_has_a_size_limit(self, connect: ConnectFixture) -> None:
    message = await mcp_call_error(connect, "save_note", {"key": "morgonrapport", "content": "x" * 20_001})
    assert "content" in message
    assert (await mcp_call(connect, "get_note", {"key": "morgonrapport"}))["content"] == ""
