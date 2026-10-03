from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import ForeignKey, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class RecipeType(StrEnum):
  dessert = "dessert"
  main = "main"
  other = "other"


class Recipe(RecordModel):
  __tablename__ = "recipes"

  title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
  # Markdown. Kept in step with `body` for clients that predate structured
  # recipes; a recipe without a body is read from it.
  content: Mapped[str] = mapped_column(Text, nullable=False, default="")
  body: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
  recipe_type: Mapped[str] = mapped_column(String(20), nullable=False, default=RecipeType.other.value)
  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
