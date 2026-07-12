from uuid import UUID

from sqlalchemy import ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class ProjectDeviceConfig(RecordModel):
  __tablename__ = "project_device_configs"
  __table_args__ = (UniqueConstraint("project_id", "device_id"),)

  project_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("projects.id"), nullable=False, index=True)
  device_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True)
  path: Mapped[str | None] = mapped_column(String(500), nullable=True)
  ssh_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
