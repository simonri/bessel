from datetime import timedelta

import pytest
from api.assistant_notes.repository import AssistantNoteRepository
from api.common.utils import utc_now
from api.models.user import User
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


class TestListAssistantNotes:
  @pytest.mark.asyncio
  async def test_none_saved_is_an_empty_list(self, client: AsyncClient) -> None:
    resp = await client.get("/v1/assistant-notes")

    assert resp.status_code == 200
    assert resp.json() == {"notes": []}

  @pytest.mark.asyncio
  async def test_lists_the_users_notes_most_recently_updated_first(self, client: AsyncClient, session: AsyncSession, user: User, other_user: User) -> None:
    repo = AssistantNoteRepository.from_session(session)
    newer = await repo.save(user.id, "morgonrapport", "Sömnsteg 1")
    older = await repo.save(user.id, "kvallsrapport", "Gym: 3 dagar")
    older.modified_at = utc_now() - timedelta(days=2)
    newer.modified_at = utc_now() - timedelta(hours=1)
    await repo.save(other_user.id, "morgonrapport", "someone else")
    gone = await repo.save(user.id, "old", "forgotten")
    gone.deleted_at = utc_now()
    await session.flush()

    notes = (await client.get("/v1/assistant-notes")).json()["notes"]

    assert [(n["key"], n["content"]) for n in notes] == [
      ("morgonrapport", "Sömnsteg 1"),
      ("kvallsrapport", "Gym: 3 dagar"),
    ]
    assert notes[0]["updated_at"] > notes[1]["updated_at"]

  @pytest.mark.asyncio
  async def test_a_never_updated_note_dates_from_when_it_was_saved(self, client: AsyncClient, session: AsyncSession, user: User) -> None:
    note = await AssistantNoteRepository.from_session(session).save(user.id, "morgonrapport", "x")
    note.modified_at = None
    await session.flush()

    notes = (await client.get("/v1/assistant-notes")).json()["notes"]

    assert notes[0]["updated_at"] is not None
