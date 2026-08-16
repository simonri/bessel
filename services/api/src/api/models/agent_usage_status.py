from datetime import datetime
from uuid import UUID

from sqlalchemy import TIMESTAMP, Float, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class AgentUsageStatus(RecordModel):
  __tablename__ = "agent_usage_status"
  __table_args__ = (UniqueConstraint("device", "agent", "window_label"),)

  user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True, index=True)
  device: Mapped[str] = mapped_column(String(100), nullable=False)
  agent: Mapped[str] = mapped_column(String(50), nullable=False)
  window_label: Mapped[str] = mapped_column(String(50), nullable=False)
  utilization_pct: Mapped[float] = mapped_column(Float, nullable=False)
  resets_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
  tier: Mapped[str | None] = mapped_column(String(50), nullable=True)
  observed_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
