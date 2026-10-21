from enum import StrEnum

from sqlalchemy import Enum, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class AssetType(StrEnum):
  stock = "stock"
  etf = "etf"
  mutual_fund = "mutual_fund"
  bond = "bond"
  crypto = "crypto"
  real_estate = "real_estate"
  other = "other"


class Security(RecordModel):
  __tablename__ = "securities"

  name: Mapped[str] = mapped_column(String(255), nullable=False)
  ticker: Mapped[str | None] = mapped_column(String(20), nullable=True)
  asset_type: Mapped[AssetType] = mapped_column(Enum(AssetType), nullable=False)
  currency: Mapped[str] = mapped_column(String(3), nullable=False)
  notes: Mapped[str | None] = mapped_column(Text, nullable=True)
  # Set for securities a broker sync found, which are matched on it.
  isin: Mapped[str | None] = mapped_column(String(12), nullable=True)

  __table_args__ = (Index("ix_securities_isin", "isin", unique=True, postgresql_where=text("isin IS NOT NULL")),)
