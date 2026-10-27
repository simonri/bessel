from uuid import UUID

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class AssistantNote(RecordModel):
  """What an assistant keeps between conversations under one key, e.g. the
  morning report's sleep streak and the suggestions the user already turned
  down. Written over MCP; not shown in the app."""

  __tablename__ = "assistant_notes"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
  key: Mapped[str] = mapped_column(String(100), nullable=False)
  content: Mapped[str] = mapped_column(Text, nullable=False)

  __table_args__ = (UniqueConstraint("user_id", "key", name="assistant_notes_user_id_key_key"),)
