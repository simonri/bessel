from api.common.repository.base import RepositoryBase
from api.models.transaction import Transaction


class TransactionRepository(RepositoryBase[Transaction]):
  model = Transaction
