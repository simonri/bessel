from datetime import datetime
from uuid import UUID

from sqlalchemy import TIMESTAMP, ForeignKey, Integer, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class KlarnaPayLater(RecordModel):
  """The Bessel account Klarna pay later purchases go into, and how it compares with what Klarna says is owed."""

  __tablename__ = "klarna_pay_later"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  bank_account_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False, unique=True)
  # What Klarna said was left to pay at the last import, in minor units.
  owed: Mapped[int | None] = mapped_column(Integer, nullable=True)
  # When the account's starting balance was set from what Klarna said was owed; it stays put after.
  balance_anchored_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
  # What Bessel owes minus what Klarna says is owed; anything but 0 means a purchase or payment is missing.
  balance_drift: Mapped[int | None] = mapped_column(Integer, nullable=True)
  last_imported_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
  # Set when the user was reminded to import again; cleared by the next import.
  stale_notified_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
