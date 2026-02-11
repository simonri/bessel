from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Date, ForeignKey, Numeric, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from api.models.bank_account import BankAccount
from api.models.base import RecordModel
from api.models.user import User


class Transaction(RecordModel):
  __tablename__ = "transactions"

  amount: Mapped[Decimal] = mapped_column(Numeric(precision=10, scale=2), nullable=False)
  date: Mapped[datetime] = mapped_column(Date, nullable=False)

  bank_account_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("bank_accounts.id", onupdate="CASCADE"), nullable=False)

  @declared_attr
  def bank_account(cls) -> Mapped["BankAccount"]:
    return relationship("BankAccount", lazy="raise")

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", onupdate="CASCADE"), nullable=False)

  @declared_attr
  def user(cls) -> Mapped["User"]:
    return relationship("User", lazy="raise")
