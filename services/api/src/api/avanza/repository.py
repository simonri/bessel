from collections.abc import Sequence
from datetime import date
from uuid import UUID, uuid4

from sqlalchemy import Row, Select, Subquery, delete, func, select, union, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import selectinload

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.common.utils import utc_now
from api.exceptions import ResourceNotFound
from api.models.avanza import AvanzaAccount, AvanzaConnection, HoldingSnapshot, HoldingSnapshotDay
from api.models.security import AssetType, Security
from api.models.trade import Trade


class AvanzaConnectionRepository(RepositoryBase[AvanzaConnection], RepositoryIDMixin[AvanzaConnection, UUID]):
  model = AvanzaConnection

  def _with_accounts(self) -> Select[AvanzaConnection]:
    return self.get_base_statement().options(selectinload(AvanzaConnection.accounts))

  async def get_for_user(self, user_id: UUID) -> AvanzaConnection | None:
    return await self.get_one_or_none(self._with_accounts().where(AvanzaConnection.user_id == user_id))

  async def list_with_accounts(self) -> Sequence[AvanzaConnection]:
    return await self.get_all(self.get_base_statement().options(selectinload(AvanzaConnection.accounts)))


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
    security = await self.get_one(select(Security).where(Security.isin == isin))
    # Rows without an order book carry Avanza's short all-caps name ("MICROSTRATEGY INC");
    # the display name from a later row ("Strategy A") replaces it.
    if security.name.isupper() and not name.isupper():
      security.name = name
    return security

  async def get_or_create_by_name(self, *, name: str, ticker: str | None, currency: str) -> Security:
    """For a broker that names a security but gives no ISIN (Montrose): the one already known by that name in that
    currency, then by ticker and currency, else a new stock. A name alone can be another listing in another currency."""
    by_name = await self.get_one_or_none(
      select(Security).where(func.lower(Security.name) == name.lower(), Security.currency == currency).order_by(Security.isin.is_(None)).limit(1)
    )
    if by_name is not None:
      return by_name
    if ticker:
      by_ticker = await self.get_one_or_none(
        select(Security).where(Security.ticker == ticker, Security.currency == currency).order_by(Security.isin.is_(None)).limit(1)
      )
      if by_ticker is not None:
        return by_ticker
    return await self.create(Security(name=name, ticker=ticker or None, asset_type=AssetType.stock, currency=currency), flush=True)


class ImportedTradeRepository(RepositoryBase[Trade], RepositoryIDMixin[Trade, UUID]):
  model = Trade

  async def delete_external(self, user_id: UUID, external_ids: Sequence[str]) -> None:
    if external_ids:
      await self.session.execute(delete(Trade).where(Trade.user_id == user_id, Trade.external_id.in_(external_ids)))

  async def move(self, from_account_id: UUID, to_account_id: UUID, *, external_prefix: str) -> None:
    """Hands a broker's imported trades to another account, for a broker account linked somewhere new."""
    await self.session.execute(
      update(Trade)
      .where(Trade.bank_account_id == from_account_id, Trade.external_id.startswith(external_prefix, autoescape=True))
      .values(bank_account_id=to_account_id)
    )

  async def insert_ignoring_duplicates(self, values: list[dict]) -> int:
    if not values:
      return 0
    statement = insert(Trade).values(values).on_conflict_do_nothing(index_elements=["user_id", "external_id"])
    return await self.execute_for_rowcount(statement)


class HoldingSnapshotRepository(RepositoryBase[HoldingSnapshot], RepositoryIDMixin[HoldingSnapshot, UUID]):
  model = HoldingSnapshot

  async def replace_day(self, bank_account_id: UUID, day: date, rows: list[dict]) -> None:
    """Today's positions for the account, replacing an earlier sync's from the same day. The day is recorded even
    when nothing is held, so positions sold since an earlier day stop showing."""
    await self.session.execute(delete(HoldingSnapshot).where(HoldingSnapshot.bank_account_id == bank_account_id, HoldingSnapshot.snapshot_date == day))
    if rows:
      await self.session.execute(insert(HoldingSnapshot).values(rows))
    await self.session.execute(
      insert(HoldingSnapshotDay)
      .values(id=uuid4(), created_at=utc_now(), bank_account_id=bank_account_id, snapshot_date=day)
      .on_conflict_do_nothing(index_elements=["bank_account_id", "snapshot_date"])
    )

  async def move(self, from_account_id: UUID, to_account_id: UUID) -> None:
    """Hands an account's snapshots to another, for a broker account linked somewhere new."""
    for model in (HoldingSnapshot, HoldingSnapshotDay):
      await self.session.execute(update(model).where(model.bank_account_id == from_account_id).values(bank_account_id=to_account_id))

  def _days(self, bank_account_ids: Sequence[UUID]) -> Subquery:
    """Every day the accounts' positions were reported: days with positions, and days recorded with none."""
    return union(
      select(HoldingSnapshot.bank_account_id, HoldingSnapshot.snapshot_date).where(HoldingSnapshot.bank_account_id.in_(bank_account_ids)),
      select(HoldingSnapshotDay.bank_account_id, HoldingSnapshotDay.snapshot_date).where(HoldingSnapshotDay.bank_account_id.in_(bank_account_ids)),
    ).subquery()

  async def daily_values(self, bank_account_ids: Sequence[UUID]) -> list[tuple[UUID, date, int]]:
    """What each account's holdings were worth on each snapshot day, 0 on a day nothing was held."""
    if not bank_account_ids:
      return []
    days = self._days(bank_account_ids)
    statement = (
      select(days.c.bank_account_id, days.c.snapshot_date, func.coalesce(func.sum(HoldingSnapshot.value), 0))
      .outerjoin(
        HoldingSnapshot,
        (HoldingSnapshot.bank_account_id == days.c.bank_account_id) & (HoldingSnapshot.snapshot_date == days.c.snapshot_date),
      )
      .group_by(days.c.bank_account_id, days.c.snapshot_date)
    )
    return [(account_id, day, int(total)) for account_id, day, total in await self.session.execute(statement)]

  async def latest_for_accounts(self, bank_account_ids: Sequence[UUID]) -> Sequence[Row]:
    """Each account's positions on its most recent snapshot day, with the security's details."""
    if not bank_account_ids:
      return []
    days = self._days(bank_account_ids)
    latest = select(days.c.bank_account_id, func.max(days.c.snapshot_date).label("day")).group_by(days.c.bank_account_id).subquery()
    statement = (
      select(
        HoldingSnapshot.bank_account_id,
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
