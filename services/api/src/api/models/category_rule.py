from enum import StrEnum
from uuid import UUID

from sqlalchemy import Boolean, Enum, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel
from api.models.transaction import TransactionDirection


class RuleScope(StrEnum):
  """Which accounts a rule looks at: the same text means different things on a company account."""

  any = "any"
  private = "private"
  company = "company"


class CategoryRule(RecordModel):
  """Puts a transaction whose description contains `pattern` into a category, when it has none."""

  __tablename__ = "category_rules"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  category_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
  # Matched case-insensitively anywhere in the description.
  pattern: Mapped[str] = mapped_column(String(255), nullable=False)
  scope: Mapped[RuleScope] = mapped_column(Enum(RuleScope), nullable=False, server_default=RuleScope.any.value)
  direction: Mapped[TransactionDirection | None] = mapped_column(Enum(TransactionDirection), nullable=True)
  # Also marks the transaction as a business expense, for company costs paid privately.
  mark_business: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
