from typing import Any

from sqlalchemy import Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class BankProfile(RecordModel):
  __tablename__ = "bank_profiles"

  bank_name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
  file_format: Mapped[str] = mapped_column(String(50), nullable=False)
  column_map: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
  skip_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
  decimal_separator: Mapped[str] = mapped_column(String(5), nullable=False, default=".")
  delimiter: Mapped[str] = mapped_column(String(5), nullable=False, default=",")
  currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
