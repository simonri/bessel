from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel

# Investment accounts: their cash moves are buys, sells and transfers between
# the user's own accounts, not income or spending.
INVESTMENT_SUBTYPES = ("isk", "af", "kf", "brokerage")


class BankAccount(RecordModel):
  __tablename__ = "bank_accounts"

  name: Mapped[str] = mapped_column(String(255), nullable=False)
  currency: Mapped[str] = mapped_column(String(3), nullable=False)
  base_balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
  subtype: Mapped[str] = mapped_column(String(255), nullable=False)
  # Owned by the user's company: its money isn't the user's own income or spending,
  # and moves between it and a personal account are real income or spending.
  is_business: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
  # Left out of net worth, such as money held for someone else.
  include_in_net_worth: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
