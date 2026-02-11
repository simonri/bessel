from uuid import UUID

from sqlalchemy import ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from api.models.base import RecordModel
from api.models.user import User


class BankAccount(RecordModel):
  __tablename__ = "bank_accounts"

  name: Mapped[str] = mapped_column(String(255), nullable=False)
  currency: Mapped[str] = mapped_column(String(3), nullable=False)
  base_balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
  subtype: Mapped[str] = mapped_column(String(255), nullable=False)

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", onupdate="CASCADE"), nullable=False)

  @declared_attr
  def user(cls) -> Mapped["User"]:
    return relationship("User", lazy="raise")
