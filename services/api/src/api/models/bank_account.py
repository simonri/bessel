from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class BankAccount(RecordModel):
  __tablename__ = "bank_accounts"

  name: Mapped[str] = mapped_column(String(255), nullable=False)
  currency: Mapped[str] = mapped_column(String(3), nullable=False)
  base_balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
  subtype: Mapped[str] = mapped_column(String(255), nullable=False)
