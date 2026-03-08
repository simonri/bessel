from datetime import datetime
from uuid import UUID

from sqlalchemy import Date, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from api.models.base import RecordModel
from api.models.security import Security


class SecurityPrice(RecordModel):
  __tablename__ = "security_prices"
  __table_args__ = (
    UniqueConstraint("security_id", "price_date", name="security_prices_security_id_price_date_key"),
  )

  security_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("securities.id", ondelete="CASCADE"), nullable=False)
  price_date: Mapped[datetime] = mapped_column(Date, nullable=False)
  price_per_unit: Mapped[int] = mapped_column(Integer, nullable=False)  # cents
  currency: Mapped[str] = mapped_column(String(3), nullable=False)

  @declared_attr
  def security(cls) -> Mapped["Security"]:
    return relationship("Security", lazy="raise")
