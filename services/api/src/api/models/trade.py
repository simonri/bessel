from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import BigInteger, Date, Enum, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from api.models.bank_account import BankAccount
from api.models.base import RecordModel
from api.models.security import Security


class TradeType(StrEnum):
  buy = "buy"
  sell = "sell"


class Trade(RecordModel):
  __tablename__ = "trades"

  security_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("securities.id", ondelete="CASCADE"), nullable=False)
  bank_account_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False)
  trade_type: Mapped[TradeType] = mapped_column(Enum(TradeType), nullable=False)
  trade_date: Mapped[datetime] = mapped_column(Date, nullable=False)
  quantity: Mapped[int] = mapped_column(BigInteger, nullable=False)  # micro-units (x1,000,000)
  price_per_unit: Mapped[int] = mapped_column(Integer, nullable=False)  # cents
  currency: Mapped[str] = mapped_column(String(3), nullable=False)
  notes: Mapped[str | None] = mapped_column(Text, nullable=True)

  @declared_attr
  def security(cls) -> Mapped["Security"]:
    return relationship("Security", lazy="raise")

  @declared_attr
  def bank_account(cls) -> Mapped["BankAccount"]:
    return relationship("BankAccount", lazy="raise")

  user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True, index=True)
