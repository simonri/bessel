from uuid import UUID

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class TransactionNameRule(RecordModel):
  """Names every transaction whose bank text is exactly `description`, including ones imported later."""

  __tablename__ = "transaction_name_rules"
  __table_args__ = (UniqueConstraint("user_id", "description"),)

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  description: Mapped[str] = mapped_column(Text, nullable=False)
  name: Mapped[str] = mapped_column(String(120), nullable=False)
