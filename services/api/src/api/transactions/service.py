from uuid import UUID

from api.common.db.postgres import AsyncSession
from api.models.import_batch import ImportBatch
from api.models.raw_transaction import RawTransaction
from api.transactions.parsers.base import ParsedTransaction
from api.transactions.repository import TransactionRepository


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
    user_id: UUID,
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

    # 3. Deduplicate: INSERT ... ON CONFLICT (user_id, dedup_hash) DO NOTHING
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
        "user_id": user_id,
      }
      for i, tx in enumerate(parsed)
    ]

    repo = TransactionRepository.from_session(session)
    created = await repo.insert_ignoring_duplicates(values)
    skipped = len(parsed) - created

    return created, skipped


transaction_service: TransactionService = TransactionService()
