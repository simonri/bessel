from enum import StrEnum
from uuid import UUID

from sqlalchemy import ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class RecipeType(StrEnum):
  dessert = "dessert"
  main = "main"
  other = "other"


class Recipe(RecordModel):
  __tablename__ = "recipes"

  title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
  content: Mapped[str] = mapped_column(Text, nullable=False, default="")
  recipe_type: Mapped[str] = mapped_column(String(20), nullable=False, default=RecipeType.other.value)
  user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True, index=True)
