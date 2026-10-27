from uuid import UUID

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from api.common.repository.base import RepositoryBase, RepositoryIDMixin, RepositoryUserMixin
from api.common.utils import utc_now
from api.models.assistant_note import AssistantNote


class AssistantNoteRepository(
  RepositoryBase[AssistantNote],
  RepositoryIDMixin[AssistantNote, UUID],
  RepositoryUserMixin[AssistantNote],
):
  model = AssistantNote

  async def list_newest_first(self, user_id: UUID) -> list[AssistantNote]:
    return list(await self.list_for_user(user_id, order_by=func.coalesce(AssistantNote.modified_at, AssistantNote.created_at).desc()))

  async def get_for_key(self, user_id: UUID, key: str) -> AssistantNote | None:
    statement = self.get_base_statement().where(AssistantNote.user_id == user_id, AssistantNote.key == key, AssistantNote.deleted_at.is_(None))
    return await self.get_one_or_none(statement)

  async def save(self, user_id: UUID, key: str, content: str) -> AssistantNote:
    """Replaces the note under `key`, creating it the first time."""
    statement = (
      pg_insert(AssistantNote)
      .values(user_id=user_id, key=key, content=content)
      .on_conflict_do_update(
        constraint="assistant_notes_user_id_key_key",
        set_={"content": content, "modified_at": utc_now(), "deleted_at": None},
      )
      .returning(AssistantNote)
      .execution_options(populate_existing=True)
    )
    return (await self.session.execute(statement)).scalar_one()
