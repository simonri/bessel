from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class Category(RecordModel):
  __tablename__ = "categories"

  name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
  color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6B7280")
