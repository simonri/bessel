from uuid import UUID

from sqlalchemy import ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class Recipe(RecordModel):
  __tablename__ = "recipes"

  title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
  content: Mapped[str] = mapped_column(Text, nullable=False, default="")
  user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True, index=True)
