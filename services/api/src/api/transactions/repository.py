from collections.abc import Sequence

from api.common.repository.base import RepositoryBase
from api.models.transaction import Transaction
from sqlalchemy import select


class TransactionRepository(RepositoryBase[Transaction]):
  model = Transaction

  async def get_existing_hashes(self, hashes: Sequence[str]) -> set[str]:
    """Return the subset of dedup_hashes that already exist."""
    if not hashes:
      return set()
    statement = select(Transaction.dedup_hash).where(Transaction.dedup_hash.in_(hashes))
    result = await self.session.execute(statement)
    return set(result.scalars().all())
