from uuid import UUID

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.transaction import Transaction


class TransactionRepository(RepositoryBase[Transaction], RepositoryIDMixin[Transaction, UUID]):
  model = Transaction
