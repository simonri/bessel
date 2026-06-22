from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class Recipe(RecordModel):
  __tablename__ = "recipes"

  title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
  content: Mapped[str] = mapped_column(Text, nullable=False, default="")
