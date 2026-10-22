from collections.abc import Sequence
from uuid import UUID

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.bank_account import BankAccount


class BankAccountRepository(RepositoryBase[BankAccount], RepositoryIDMixin[BankAccount, UUID]):
  model = BankAccount

  async def list_for_user(self, user_id: UUID) -> Sequence[BankAccount]:
    return await self.get_all(self.get_base_statement().where(BankAccount.user_id == user_id).order_by(BankAccount.name))
