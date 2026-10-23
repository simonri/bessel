from collections.abc import Sequence
from uuid import UUID, uuid4

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.common.utils import utc_now
from api.models.document import Document, TransactionDocument


class DocumentRepository(RepositoryBase[Document], RepositoryIDMixin[Document, UUID]):
  model = Document

  async def get_by_checksum(self, user_id: UUID, sha256: str) -> Document | None:
    return await self.get_one_or_none(self.get_base_statement().where(Document.user_id == user_id, Document.sha256 == sha256))

  async def total_bytes_for_user(self, user_id: UUID) -> int:
    statement = select(func.coalesce(func.sum(Document.size_bytes), 0)).where(Document.user_id == user_id, Document.deleted_at.is_(None))
    return (await self.session.execute(statement)).scalar_one()

  async def for_transaction(self, transaction_id: UUID) -> Sequence[Document]:
    statement = (
      self.get_base_statement()
      .join(TransactionDocument, TransactionDocument.document_id == Document.id)
      .where(TransactionDocument.transaction_id == transaction_id)
      .order_by(TransactionDocument.created_at)
    )
    return await self.get_all(statement)

  async def is_linked(self, transaction_id: UUID, document_id: UUID) -> bool:
    statement = select(func.count()).where(TransactionDocument.transaction_id == transaction_id, TransactionDocument.document_id == document_id)
    return (await self.session.execute(statement)).scalar_one() > 0

  async def link(self, transaction_id: UUID, document_id: UUID) -> None:
    """Links the two; linking them again, even from a request running at the same time, changes nothing."""
    statement = (
      insert(TransactionDocument)
      .values(id=uuid4(), created_at=utc_now(), transaction_id=transaction_id, document_id=document_id)
      .on_conflict_do_nothing(index_elements=["transaction_id", "document_id"])
    )
    await self.session.execute(statement)

  async def lock(self, document_id: UUID) -> None:
    """Holds the document until the transaction ends, so two removals can't each see the other's link still there."""
    await self.session.execute(select(Document.id).where(Document.id == document_id).with_for_update())

  async def unlinked_for_user(self, user_id: UUID) -> Sequence[Document]:
    """The user's documents that belong to no transaction any more, such as after their transactions were deleted."""
    linked = select(TransactionDocument.id).where(TransactionDocument.document_id == Document.id).exists()
    return await self.get_all(self.get_base_statement().where(Document.user_id == user_id, ~linked))

  async def unlink(self, transaction_id: UUID, document_id: UUID) -> int:
    """Removes the link and says how many transactions the document still belongs to."""
    await self.session.execute(
      delete(TransactionDocument).where(TransactionDocument.transaction_id == transaction_id, TransactionDocument.document_id == document_id)
    )
    statement = select(func.count()).where(TransactionDocument.document_id == document_id)
    return (await self.session.execute(statement)).scalar_one()

  async def counts_for_transactions(self, transaction_ids: Sequence[UUID]) -> dict[UUID, int]:
    if not transaction_ids:
      return {}
    statement = (
      select(TransactionDocument.transaction_id, func.count())
      .where(TransactionDocument.transaction_id.in_(transaction_ids))
      .group_by(TransactionDocument.transaction_id)
    )
    return dict((await self.session.execute(statement)).all())  # type: ignore[arg-type]
