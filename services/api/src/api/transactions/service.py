from uuid import UUID

from api.common.db.postgres import AsyncSession
from api.models.transaction import Transaction
from api.transactions.parsers.base import ParsedTransaction
from api.transactions.repository import TransactionRepository


class TransactionService:
  async def import_transactions(
    self,
    session: AsyncSession,
    *,
    bank_account_id: UUID,
    parsed: list[ParsedTransaction],
  ) -> tuple[int, int]:
    """Import parsed transactions, skipping duplicates.

    Returns (created_count, skipped_count).
    """
    repo = TransactionRepository.from_session(session)

    all_hashes = [t.dedup_hash for t in parsed]
    existing_hashes = await repo.get_existing_hashes(all_hashes)

    created = 0
    skipped = 0

    for tx in parsed:
      if tx.dedup_hash in existing_hashes:
        skipped += 1
        continue

      transaction = Transaction(
        amount=tx.amount_minor,
        currency=tx.currency,
        transaction_date=tx.transaction_date,
        direction=tx.direction,
        dedup_hash=tx.dedup_hash,
        bank_account_id=bank_account_id,
      )
      await repo.create(transaction)
      created += 1

    return created, skipped


transaction_service: TransactionService = TransactionService()
