from uuid import UUID

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.bank_account import BankAccount


class BankAccountRepository(RepositoryBase[BankAccount], RepositoryIDMixin[BankAccount, UUID]):
  model = BankAccount
