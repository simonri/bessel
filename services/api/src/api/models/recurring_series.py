from enum import StrEnum
from uuid import UUID

from sqlalchemy import Enum, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class RecurringKind(StrEnum):
  bill = "bill"
  subscription = "subscription"
  income = "income"


class RecurringDecision(StrEnum):
  confirmed = "confirmed"
  # Not a recurring payment to the user; detection keeps finding it but never shows it again.
  dismissed = "dismissed"


class RecurringSeries(RecordModel):
  """The user's word on a recurring series Bessel detected: kept apart from the detection, which reruns on every read."""

  __tablename__ = "recurring_series"
  # One review per detected series: a second quick action on it changes the same row.
  __table_args__ = (UniqueConstraint("user_id", "key", "typical_amount"),)

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  # Which group of transactions the series comes from: direction, currency, owner and merchant.
  key: Mapped[str] = mapped_column(String(300), nullable=False)
  # Its typical amount when the user acted, telling apart two series in one group, such as two plans from one shop.
  typical_amount: Mapped[int] = mapped_column(Integer, nullable=False)
  decision: Mapped[RecurringDecision | None] = mapped_column(Enum(RecurringDecision, name="recurring_decision"), nullable=True)
  name: Mapped[str | None] = mapped_column(String(120), nullable=True)
  kind: Mapped[RecurringKind | None] = mapped_column(Enum(RecurringKind, name="recurring_kind"), nullable=True)
