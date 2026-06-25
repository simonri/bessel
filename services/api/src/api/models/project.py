from uuid import UUID

from sqlalchemy import ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class Project(RecordModel):
  __tablename__ = "projects"

  name: Mapped[str] = mapped_column(String(100), nullable=False)
  user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True, index=True)
