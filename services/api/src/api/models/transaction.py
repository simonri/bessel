from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
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
  # Dedup is per-user: two users importing the same bank export must each get their own rows.
  __table_args__ = (UniqueConstraint("user_id", "dedup_hash"),)

  amount: Mapped[int] = mapped_column(Integer, nullable=False)
  currency: Mapped[str] = mapped_column(String(3), nullable=False)
  transaction_date: Mapped[datetime] = mapped_column(Date, nullable=False)
  direction: Mapped[TransactionDirection] = mapped_column(Enum(TransactionDirection), nullable=False)
  dedup_hash: Mapped[str] = mapped_column(String(70), nullable=False)
  description: Mapped[str | None] = mapped_column(Text, nullable=True)
  transaction_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
  # The merchant's own logo, only when the source says which it is (Klarna does); never guessed from the text.
  logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
  is_business: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
  # Shared by both sides of money moving between the user's own accounts; such pairs count as neither income nor spending.
  transfer_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True, index=True)
  # Set when the user undid a pairing, so it isn't paired again.
  not_a_transfer: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

  bank_account_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("bank_accounts.id", onupdate="CASCADE"), nullable=False)

  @declared_attr
  def bank_account(cls) -> Mapped["BankAccount"]:
    return relationship("BankAccount", lazy="raise")

  category_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("categories.id", onupdate="CASCADE", ondelete="SET NULL"), nullable=True)

  @declared_attr
  def category(cls) -> Mapped["Category | None"]:
    return relationship("Category", lazy="raise")

  # Set when a rule chose the category rather than the user: a rule's choice gives way to a transfer pair.
  category_rule_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("category_rules.id", ondelete="SET NULL"), nullable=True)

  # What the user calls it; the bank's own text stays in `description`.
  name: Mapped[str | None] = mapped_column(String(120), nullable=True)
  # Set when a naming rule gave the name rather than the user.
  name_rule_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("transaction_name_rules.id", ondelete="SET NULL"), nullable=True)
  # Set when the user went back to the bank's text: naming its group later leaves this one as it is.
  name_cleared: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
  note: Mapped[str | None] = mapped_column(Text, nullable=True)

  raw_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("raw_transactions.id", onupdate="CASCADE"), nullable=True)

  @declared_attr
  def raw_transaction(cls) -> Mapped["RawTransaction | None"]:
    return relationship("RawTransaction", lazy="raise")

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
