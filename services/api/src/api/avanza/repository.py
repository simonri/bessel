from collections.abc import Sequence
from datetime import date
from uuid import UUID

from sqlalchemy import Row, Select, delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import selectinload

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.exceptions import ResourceNotFound
from api.models.avanza import AvanzaAccount, AvanzaConnection, HoldingSnapshot
from api.models.security import AssetType, Security
from api.models.trade import Trade


class AvanzaConnectionRepository(RepositoryBase[AvanzaConnection], RepositoryIDMixin[AvanzaConnection, UUID]):
  model = AvanzaConnection

  def _with_accounts(self) -> Select[AvanzaConnection]:
    return self.get_base_statement().options(selectinload(AvanzaConnection.accounts))

  async def get_for_user(self, user_id: UUID) -> AvanzaConnection | None:
    return await self.get_one_or_none(self._with_accounts().where(AvanzaConnection.user_id == user_id))

  async def get_with_accounts(self, connection_id: UUID) -> AvanzaConnection | None:
    return await self.get_one_or_none(self._with_accounts().where(AvanzaConnection.id == connection_id))

  async def list_syncable_ids(self) -> Sequence[UUID]:
    """Connections whose login Avanza hasn't rejected."""
    statement = select(AvanzaConnection.id).where(AvanzaConnection.credentials_rejected_at.is_(None))
    return (await self.session.execute(statement)).scalars().all()


class AvanzaAccountRepository(RepositoryBase[AvanzaAccount], RepositoryIDMixin[AvanzaAccount, UUID]):
  model = AvanzaAccount

  async def get_owned(self, account_id: UUID, user_id: UUID) -> AvanzaAccount:
    statement = (
      self.get_base_statement()
      .join(AvanzaConnection, AvanzaConnection.id == AvanzaAccount.connection_id)
      .where(AvanzaAccount.id == account_id, AvanzaConnection.user_id == user_id)
    )
    account = await self.get_one_or_none(statement)
    if account is None:
      raise ResourceNotFound("Avanza account not found")
    return account

  async def is_linked_elsewhere(self, bank_account_id: UUID, account: AvanzaAccount) -> bool:
    statement = select(AvanzaAccount.id).where(AvanzaAccount.bank_account_id == bank_account_id, AvanzaAccount.id != account.id)
    return (await self.session.execute(statement)).first() is not None

  async def linked_bank_account_ids(self, user_id: UUID) -> list[UUID]:
    statement = (
      select(AvanzaAccount.bank_account_id)
      .join(AvanzaConnection, AvanzaConnection.id == AvanzaAccount.connection_id)
      .where(AvanzaConnection.user_id == user_id, AvanzaAccount.bank_account_id.is_not(None))
    )
    return [bank_account_id for bank_account_id in (await self.session.execute(statement)).scalars() if bank_account_id is not None]


class SecurityCatalogRepository(RepositoryBase[Security], RepositoryIDMixin[Security, UUID]):
  model = Security

  async def get_or_create_by_isin(self, *, isin: str, name: str, asset_type: AssetType, currency: str) -> Security:
    statement = (
      insert(Security)
      .values(isin=isin, name=name, asset_type=asset_type, currency=currency)
      .on_conflict_do_nothing(index_elements=["isin"], index_where=Security.isin.is_not(None))
    )
    await self.session.execute(statement)
    return await self.get_one(select(Security).where(Security.isin == isin))


class ImportedTradeRepository(RepositoryBase[Trade], RepositoryIDMixin[Trade, UUID]):
  model = Trade

  async def insert_ignoring_duplicates(self, values: list[dict]) -> int:
    if not values:
      return 0
    statement = insert(Trade).values(values).on_conflict_do_nothing(index_elements=["user_id", "external_id"])
    return await self.execute_for_rowcount(statement)


class HoldingSnapshotRepository(RepositoryBase[HoldingSnapshot], RepositoryIDMixin[HoldingSnapshot, UUID]):
  model = HoldingSnapshot

  async def replace_day(self, bank_account_id: UUID, day: date, rows: list[dict]) -> None:
    """Today's positions for the account, replacing an earlier sync's from the same day."""
    await self.session.execute(delete(HoldingSnapshot).where(HoldingSnapshot.bank_account_id == bank_account_id, HoldingSnapshot.snapshot_date == day))
    if rows:
      await self.session.execute(insert(HoldingSnapshot).values(rows))

  async def latest_for_accounts(self, bank_account_ids: Sequence[UUID]) -> Sequence[Row]:
    """Each account's positions on its most recent snapshot day, with the security's details."""
    if not bank_account_ids:
      return []
    latest = (
      select(HoldingSnapshot.bank_account_id, func.max(HoldingSnapshot.snapshot_date).label("day"))
      .where(HoldingSnapshot.bank_account_id.in_(bank_account_ids))
      .group_by(HoldingSnapshot.bank_account_id)
      .subquery()
    )
    statement = (
      select(
        HoldingSnapshot.security_id,
        Security.name,
        Security.ticker,
        Security.asset_type,
        HoldingSnapshot.currency,
        HoldingSnapshot.quantity,
        HoldingSnapshot.value,
        HoldingSnapshot.acquired_value,
      )
      .join(latest, (HoldingSnapshot.bank_account_id == latest.c.bank_account_id) & (HoldingSnapshot.snapshot_date == latest.c.day))
      .join(Security, Security.id == HoldingSnapshot.security_id)
    )
    return (await self.session.execute(statement)).all()
