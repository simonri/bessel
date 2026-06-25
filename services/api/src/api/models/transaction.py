from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from api.models.bank_account import BankAccount
from api.models.base import RecordModel
from api.models.category import Category
from api.models.raw_transaction import RawTransaction


class TransactionDirection(StrEnum):
  debit = "debit"
  credit = "credit"


class Transaction(RecordModel):
  __tablename__ = "transactions"

  amount: Mapped[int] = mapped_column(Integer, nullable=False)
  currency: Mapped[str] = mapped_column(String(3), nullable=False)
  transaction_date: Mapped[datetime] = mapped_column(Date, nullable=False)
  direction: Mapped[TransactionDirection] = mapped_column(Enum(TransactionDirection), nullable=False)
  dedup_hash: Mapped[str] = mapped_column(String(70), nullable=False, unique=True)
  description: Mapped[str | None] = mapped_column(Text, nullable=True)
  transaction_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
  is_business: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

  bank_account_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("bank_accounts.id", onupdate="CASCADE"), nullable=False)

  @declared_attr
  def bank_account(cls) -> Mapped["BankAccount"]:
    return relationship("BankAccount", lazy="raise")

  category_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("categories.id", onupdate="CASCADE", ondelete="SET NULL"), nullable=True)

  @declared_attr
  def category(cls) -> Mapped["Category | None"]:
    return relationship("Category", lazy="raise")

  raw_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("raw_transactions.id", onupdate="CASCADE"), nullable=True)

  @declared_attr
  def raw_transaction(cls) -> Mapped["RawTransaction | None"]:
    return relationship("RawTransaction", lazy="raise")

  user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True, index=True)
