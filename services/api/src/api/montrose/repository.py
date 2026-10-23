from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.orm import selectinload

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.exceptions import ResourceNotFound
from api.models.montrose import MontroseAccount, MontroseConnection


class MontroseConnectionRepository(RepositoryBase[MontroseConnection], RepositoryIDMixin[MontroseConnection, UUID]):
  model = MontroseConnection

  def _with_accounts(self) -> Select[MontroseConnection]:
    return self.get_base_statement().options(selectinload(MontroseConnection.accounts))

  async def get_for_user(self, user_id: UUID) -> MontroseConnection | None:
    return await self.get_one_or_none(self._with_accounts().where(MontroseConnection.user_id == user_id))

  async def get_with_accounts(self, connection_id: UUID) -> MontroseConnection | None:
    return await self.get_one_or_none(self._with_accounts().where(MontroseConnection.id == connection_id))

  async def get_locked(self, connection_id: UUID) -> MontroseConnection | None:
    """The connection, locked until the transaction ends, so only one sync refreshes its tokens at a time."""
    return await self.get_one_or_none(self.get_base_statement().where(MontroseConnection.id == connection_id).with_for_update())

  async def list_syncable_ids(self) -> Sequence[UUID]:
    """Connections whose consent Montrose still accepts."""
    statement = select(MontroseConnection.id).where(MontroseConnection.rejected_at.is_(None), MontroseConnection.deleted_at.is_(None))
    return (await self.session.execute(statement)).scalars().all()


class MontroseAccountRepository(RepositoryBase[MontroseAccount], RepositoryIDMixin[MontroseAccount, UUID]):
  model = MontroseAccount

  async def get_owned(self, account_id: UUID, user_id: UUID) -> MontroseAccount:
    statement = (
      self.get_base_statement()
      .join(MontroseConnection, MontroseConnection.id == MontroseAccount.connection_id)
      .where(MontroseAccount.id == account_id, MontroseConnection.user_id == user_id)
    )
    account = await self.get_one_or_none(statement)
    if account is None:
      raise ResourceNotFound("Montrose account not found")
    return account

  async def linked_bank_account_ids(self, user_id: UUID) -> list[UUID]:
    statement = (
      select(MontroseAccount.bank_account_id)
      .join(MontroseConnection, MontroseConnection.id == MontroseAccount.connection_id)
      .where(MontroseConnection.user_id == user_id, MontroseAccount.bank_account_id.is_not(None))
    )
    return [bank_account_id for bank_account_id in (await self.session.execute(statement)).scalars() if bank_account_id is not None]

  async def is_linked_elsewhere(self, bank_account_id: UUID, account: MontroseAccount) -> bool:
    statement = select(MontroseAccount.id).where(MontroseAccount.bank_account_id == bank_account_id, MontroseAccount.id != account.id)
    return (await self.session.execute(statement)).first() is not None
