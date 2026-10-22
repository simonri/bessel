from uuid import UUID

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class Document(RecordModel):
  """An invoice or receipt the user keeps: a PDF or a photo, with previews of its pages."""

  __tablename__ = "documents"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  filename: Mapped[str] = mapped_column(String(255), nullable=False)
  content_type: Mapped[str] = mapped_column(String(100), nullable=False)
  size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
  # The same file uploaded twice is one document, linked wherever it belongs.
  sha256: Mapped[str] = mapped_column(String(64), nullable=False)
  # Pages with a preview; a photo has one.
  page_count: Mapped[int] = mapped_column(Integer, nullable=False)

  __table_args__ = (UniqueConstraint("user_id", "sha256"),)


class TransactionDocument(RecordModel):
  """One document belonging to one transaction: an invoice may cover several, and a transaction may have several."""

  __tablename__ = "transaction_documents"

  transaction_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False, index=True)
  document_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)

  __table_args__ = (UniqueConstraint("transaction_id", "document_id"),)
