from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.orm import selectinload

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.exceptions import ResourceNotFound
from api.models.bank_connection import BankConnection, BankConnectionAccount


class BankConnectionRepository(RepositoryBase[BankConnection], RepositoryIDMixin[BankConnection, UUID]):
  model = BankConnection

  def _with_accounts(self) -> Select[BankConnection]:
    return self.get_base_statement().options(selectinload(BankConnection.accounts))

  async def list_for_user(self, user_id: UUID) -> Sequence[BankConnection]:
    return await self.get_all(self._with_accounts().where(BankConnection.user_id == user_id).order_by(BankConnection.created_at))

  async def get_owned(self, connection_id: UUID, user_id: UUID) -> BankConnection:
    connection = await self.get_one_or_none(self._with_accounts().where(BankConnection.id == connection_id, BankConnection.user_id == user_id))
    if connection is None:
      raise ResourceNotFound("Bank connection not found")
    return connection

  async def get_with_accounts(self, connection_id: UUID) -> BankConnection | None:
    return await self.get_one_or_none(self._with_accounts().where(BankConnection.id == connection_id))

  async def get_for_bank(self, user_id: UUID, bank_name: str, bank_country: str) -> BankConnection | None:
    statement = self._with_accounts().where(
      BankConnection.user_id == user_id, BankConnection.bank_name == bank_name, BankConnection.bank_country == bank_country
    )
    return await self.get_one_or_none(statement)

  async def list_ids(self) -> Sequence[UUID]:
    return (await self.session.execute(select(BankConnection.id))).scalars().all()


class BankConnectionAccountRepository(RepositoryBase[BankConnectionAccount], RepositoryIDMixin[BankConnectionAccount, UUID]):
  model = BankConnectionAccount

  async def get_owned(self, account_id: UUID, user_id: UUID) -> BankConnectionAccount:
    statement = (
      self.get_base_statement()
      .join(BankConnection, BankConnection.id == BankConnectionAccount.connection_id)
      .where(BankConnectionAccount.id == account_id, BankConnection.user_id == user_id)
    )
    account = await self.get_one_or_none(statement)
    if account is None:
      raise ResourceNotFound("Bank account not found")
    return account
