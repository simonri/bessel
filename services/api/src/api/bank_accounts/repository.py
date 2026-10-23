from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.bank_account import BankAccount


class BankAccountRepository(RepositoryBase[BankAccount], RepositoryIDMixin[BankAccount, UUID]):
  model = BankAccount

  async def list_for_user(self, user_id: UUID) -> Sequence[BankAccount]:
    return await self.get_all(self.get_base_statement().where(BankAccount.user_id == user_id).order_by(BankAccount.name))

  async def company_ids(self, ids: Sequence[UUID]) -> set[UUID]:
    """Which of the accounts belong to the user's company."""
    if not ids:
      return set()
    return set(await self.session.scalars(select(BankAccount.id).where(BankAccount.id.in_(ids), BankAccount.is_business.is_(True))))
