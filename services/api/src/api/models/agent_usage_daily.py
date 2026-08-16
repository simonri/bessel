from datetime import date
from uuid import UUID

from sqlalchemy import BigInteger, Date, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class AgentUsageDaily(RecordModel):
  __tablename__ = "agent_usage_daily"
  __table_args__ = (UniqueConstraint("device", "agent", "date", "model"),)

  user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True, index=True)
  device: Mapped[str] = mapped_column(String(100), nullable=False)
  agent: Mapped[str] = mapped_column(String(50), nullable=False)
  date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
  model: Mapped[str] = mapped_column(String(100), nullable=False)
  input_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
  output_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
  cache_read_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
  cache_creation_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
