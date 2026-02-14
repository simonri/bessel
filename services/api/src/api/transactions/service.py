from uuid import UUID

from api.common.db.postgres import AsyncSession
from api.models.import_batch import ImportBatch
from api.models.raw_transaction import RawTransaction
from api.models.transaction import Transaction
from api.transactions.parsers.base import ParsedTransaction
from sqlalchemy.dialects.postgresql import insert


class TransactionService:
  async def import_transactions(
    self,
    session: AsyncSession,
    *,
    bank_account_id: UUID,
    bank_name: str,
    file_format: str,
    raw_content: str,
    parsed: list[ParsedTransaction],
  ) -> tuple[int, int]:
    """Full import pipeline: store raw → map & normalize → deduplicate.

    Returns (created_count, skipped_count).
    """
    if not parsed:
      return 0, 0

    # 1. Store raw: create ImportBatch
    batch = ImportBatch(
      bank_name=bank_name,
      file_format=file_format,
      raw_content=raw_content,
      row_count=len(parsed),
    )
    session.add(batch)
    await session.flush()

    # 2. Store raw: create RawTransaction for each row
    raw_transactions: list[RawTransaction] = []
    for i, tx in enumerate(parsed):
      raw_tx = RawTransaction(
        row_number=i,
        raw_data=tx.raw_data,
        batch_id=batch.id,
      )
      session.add(raw_tx)
      raw_transactions.append(raw_tx)
    await session.flush()

    # 3. Deduplicate: INSERT ... ON CONFLICT (dedup_hash) DO NOTHING
    values = [
      {
        "amount": tx.amount_minor,
        "currency": tx.currency,
        "transaction_date": tx.transaction_date,
        "direction": tx.direction,
        "dedup_hash": tx.dedup_hash,
        "description": tx.description or None,
        "bank_account_id": bank_account_id,
        "raw_id": raw_transactions[i].id,
      }
      for i, tx in enumerate(parsed)
    ]

    stmt = insert(Transaction).values(values).on_conflict_do_nothing(index_elements=["dedup_hash"])
    result = await session.execute(stmt)
    created = result.rowcount
    skipped = len(parsed) - created

    return created, skipped


transaction_service: TransactionService = TransactionService()
