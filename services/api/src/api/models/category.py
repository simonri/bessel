from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class Category(RecordModel):
  __tablename__ = "categories"

  name: Mapped[str] = mapped_column(String(100), nullable=False)
  slug: Mapped[str] = mapped_column(String(100), nullable=False)
  color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6B7280")
  excluded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
  parent_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("categories.id", ondelete="CASCADE"), nullable=True)
  user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True, index=True)
