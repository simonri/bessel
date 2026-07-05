from uuid import UUID

from sqlalchemy import ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class Project(RecordModel):
  __tablename__ = "projects"

  name: Mapped[str] = mapped_column(String(100), nullable=False)
  user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True, index=True)
  path: Mapped[str | None] = mapped_column(String(500), nullable=True)
  ssh_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
