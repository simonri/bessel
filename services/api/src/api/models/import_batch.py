from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class ImportBatch(RecordModel):
  __tablename__ = "import_batches"

  bank_name: Mapped[str] = mapped_column(String(255), nullable=False)
  file_format: Mapped[str] = mapped_column(String(50), nullable=False)
  raw_content: Mapped[str] = mapped_column(Text, nullable=False)
  row_count: Mapped[int] = mapped_column(Integer, nullable=False)
