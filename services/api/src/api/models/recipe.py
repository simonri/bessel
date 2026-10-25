from datetime import date
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import Date, ForeignKey, String, Text, UniqueConstraint, Uuid
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


class RecipeCook(RecordModel):
  """A day the user cooked a recipe; at most one per recipe and day."""

  __tablename__ = "recipe_cooks"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  recipe_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False)
  cooked_on: Mapped[date] = mapped_column(Date, nullable=False)

  __table_args__ = (UniqueConstraint("recipe_id", "cooked_on", name="recipe_cooks_recipe_id_cooked_on_key"),)
