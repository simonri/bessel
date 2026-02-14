from typing import Any
from uuid import UUID

from sqlalchemy import ForeignKey, Integer, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from api.models.base import RecordModel
from api.models.import_batch import ImportBatch


class RawTransaction(RecordModel):
  __tablename__ = "raw_transactions"

  row_number: Mapped[int] = mapped_column(Integer, nullable=False)
  raw_data: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

  batch_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("import_batches.id", onupdate="CASCADE"), nullable=False)

  @declared_attr
  def import_batch(cls) -> Mapped["ImportBatch"]:
    return relationship("ImportBatch", lazy="raise")
