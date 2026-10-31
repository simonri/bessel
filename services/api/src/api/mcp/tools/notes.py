from datetime import datetime
from typing import Annotated

from mcp.server.mcpserver import Context
from pydantic import Field

from api.assistant_notes.repository import AssistantNoteRepository
from api.common.schemas import Schema
from api.mcp.context import user_session
from api.mcp.tools.common import ToolSpec, read, write

MAX_NOTE_CHARS = 20_000

NoteKey = Annotated[
  str,
  Field(
    min_length=1,
    max_length=100,
    pattern=r"^[a-z0-9][a-z0-9_-]*$",
    description="Which note, e.g. 'morgonrapport'. Lowercase letters, digits, - and _.",
  ),
]


class Note(Schema):
  key: str
  content: str = Field(description="Empty when nothing has been saved under this key yet.")
  updated_at: datetime | None


async def get_note(ctx: Context, key: NoteKey) -> Note:
  """Read what you saved for yourself under `key` in an earlier conversation.

  Notes carry state between runs that start fresh, e.g. a daily report's streaks, which of its suggestions the user
  approved or turned down, and things not to bring up again. Read it before acting on earlier context.
  """
  async with user_session(ctx) as (session, user):
    note = await AssistantNoteRepository.from_session(session).get_for_key(user.id, key)
  if note is None:
    return Note(key=key, content="", updated_at=None)
  return Note(key=key, content=note.content, updated_at=note.modified_at or note.created_at)


async def save_note(
  ctx: Context,
  key: NoteKey,
  content: Annotated[str, Field(max_length=MAX_NOTE_CHARS, description="The whole note. It replaces what was there.")],
) -> Note:
  """Save a note for yourself under `key`, replacing the previous one; read it first with get_note and send it back
  with your changes, so nothing earlier is lost. Keep it short and current: state, decisions and the user's answers,
  not copies of reports."""
  async with user_session(ctx) as (session, user):
    note = await AssistantNoteRepository.from_session(session).save(user.id, key, content)
  return Note(key=key, content=note.content, updated_at=note.modified_at or note.created_at)


TOOLS: list[ToolSpec] = [
  read(get_note, "Note"),
  write(save_note, "Save note", idempotent=True, overwrites=True),
]
