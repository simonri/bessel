from collections.abc import Sequence
from datetime import date
from typing import Any, NamedTuple
from uuid import UUID

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.bank_account import INVESTMENT_SUBTYPES, BankAccount
from api.models.bank_profile import BankProfile
from api.models.category import Category
from api.models.import_batch import ImportBatch
from api.models.raw_transaction import RawTransaction
from api.models.transaction import Transaction, TransactionDirection
from sqlalchemy import Row, Select, case, delete, exists, extract, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import aliased


class ReportRow(NamedTuple):
  transaction_date: date
  currency: str
  direction: TransactionDirection
  amount: int
  description: str | None
  category_id: UUID | None
  category_name: str | None
  category_color: str | None
  # A credit under a description the user was also charged under: money back, not income.
  refund: bool


class RuleCandidate(NamedTuple):
  id: UUID
  description: str | None
  direction: TransactionDirection
  company_account: bool


class TransferCandidate(NamedTuple):
  id: UUID
  bank_account_id: UUID
  amount: int
  currency: str
  direction: TransactionDirection
  transaction_date: date
  # Whether the account is the company's; money only moves "between own accounts" on one side of that line.
  business: bool = False


def _counted_in_reports[*Ts](statement: Select[*Ts]) -> Select[*Ts]:
  """The user's own income and spending: no investment or company accounts, transfers between own accounts, or excluded categories."""
  return statement.join(BankAccount, Transaction.bank_account_id == BankAccount.id).where(
    BankAccount.subtype.not_in(INVESTMENT_SUBTYPES),
    BankAccount.is_business.is_(False),
    Transaction.transfer_id.is_(None),
    or_(Category.id.is_(None), Category.excluded.is_(False)),
  )


class TransactionRepository(RepositoryBase[Transaction], RepositoryIDMixin[Transaction, UUID]):
  model = Transaction

  async def report_rows(self, user_id: UUID, *, start: date, end: date) -> list[ReportRow]:
    """The user's own income and spending between two days (inclusive), with what each row counts as."""
    charged = aliased(Transaction)
    refund = (Transaction.direction == TransactionDirection.credit) & exists().where(
      charged.user_id == Transaction.user_id,
      # Money back lands where it was charged; a generic text like "Överföring" elsewhere isn't a refund.
      charged.bank_account_id == Transaction.bank_account_id,
      charged.direction == TransactionDirection.debit,
      charged.description == Transaction.description,
      charged.deleted_at.is_(None),
    )
    statement = _counted_in_reports(
      select(
        Transaction.transaction_date,
        Transaction.currency,
        Transaction.direction,
        Transaction.amount,
        Transaction.description,
        Transaction.category_id,
        Category.name,
        Category.color,
        refund.label("refund"),
      )
      .outerjoin(Category, Transaction.category_id == Category.id)
      .where(
        Transaction.user_id == user_id,
        Transaction.deleted_at.is_(None),
        Transaction.transaction_date >= start,
        Transaction.transaction_date <= end,
      )
    )
    return [ReportRow(*row) for row in await self.session.execute(statement)]

  async def account_activity(self, account_ids: Sequence[UUID]) -> dict[UUID, tuple[date, date, int]]:
    """Each account's first and last transaction day, and how many it has."""
    if not account_ids:
      return {}
    statement = (
      select(Transaction.bank_account_id, func.min(Transaction.transaction_date), func.max(Transaction.transaction_date), func.count())
      .where(Transaction.bank_account_id.in_(account_ids), Transaction.deleted_at.is_(None))
      .group_by(Transaction.bank_account_id)
    )
    return {account_id: (first, last, count) for account_id, first, last, count in await self.session.execute(statement)}

  async def flows_by_type(self, account_ids: Sequence[UUID]) -> dict[UUID, dict[str, dict[int, int]]]:
    """Per account, the net amount of each kind of movement per year: credits positive, debits negative."""
    if not account_ids:
      return {}
    year = extract("year", Transaction.transaction_date)
    net = func.sum(case((Transaction.direction == TransactionDirection.credit, Transaction.amount), else_=-Transaction.amount))
    statement = (
      select(Transaction.bank_account_id, Transaction.transaction_type, year, net)
      .where(Transaction.bank_account_id.in_(account_ids), Transaction.deleted_at.is_(None), Transaction.transaction_type.is_not(None))
      .group_by(Transaction.bank_account_id, Transaction.transaction_type, year)
    )
    flows: dict[UUID, dict[str, dict[int, int]]] = {}
    for account_id, kind, in_year, total in await self.session.execute(statement):
      flows.setdefault(account_id, {}).setdefault(kind or "", {})[int(in_year)] = int(total)
    return flows

  async def monthly_net_by_account(self, account_ids: Sequence[UUID]) -> list[tuple[UUID, date, int]]:
    """Each account's credits minus debits per month, keyed by the month's first day."""
    if not account_ids:
      return []
    month = func.date_trunc("month", Transaction.transaction_date)
    net = func.sum(case((Transaction.direction == TransactionDirection.credit, Transaction.amount), else_=-Transaction.amount))
    statement = (
      select(Transaction.bank_account_id, month, net)
      .where(Transaction.bank_account_id.in_(account_ids), Transaction.deleted_at.is_(None))
      .group_by(Transaction.bank_account_id, month)
      .order_by(month)
    )
    return [(account_id, first.date(), int(total)) for account_id, first, total in await self.session.execute(statement)]

  async def count_left_out_as_transfers(self, user_id: UUID, *, start: date, end: date) -> int:
    statement = select(func.count()).where(
      Transaction.user_id == user_id,
      Transaction.deleted_at.is_(None),
      Transaction.transfer_id.is_not(None),
      Transaction.transaction_date >= start,
      Transaction.transaction_date <= end,
    )
    return (await self.session.execute(statement)).scalar_one()

  def get_filtered_statement(
    self,
    user_id: UUID,
    *,
    bank_account_ids: Sequence[UUID] | None = None,
    category_ids: Sequence[UUID] | None = None,
    uncategorized: bool = False,
    direction: TransactionDirection | str | None = None,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    is_business: bool | None = None,
    transfers: bool | None = None,
  ) -> Select[Transaction]:
    statement = self.get_base_statement().where(Transaction.user_id == user_id)
    if bank_account_ids:
      statement = statement.where(Transaction.bank_account_id.in_(bank_account_ids))
    if category_ids:
      statement = statement.where(Transaction.category_id.in_(category_ids))
    if uncategorized:
      statement = statement.where(Transaction.category_id.is_(None))
    if direction:
      statement = statement.where(Transaction.direction == direction)
    if search:
      statement = statement.where(Transaction.description.ilike(f"%{search}%"))
    if date_from:
      statement = statement.where(Transaction.transaction_date >= date_from)
    if date_to:
      statement = statement.where(Transaction.transaction_date <= date_to)
    if is_business is not None:
      statement = statement.where(Transaction.is_business == is_business)
    if transfers is not None:
      statement = statement.where(Transaction.transfer_id.is_not(None) if transfers else Transaction.transfer_id.is_(None))
    return statement

  async def create_import_batch(self, batch: ImportBatch) -> ImportBatch:
    self.session.add(batch)
    await self.session.flush()
    return batch

  async def create_raw_transactions(self, raw_transactions: Sequence[RawTransaction]) -> None:
    self.session.add_all(raw_transactions)
    await self.session.flush()

  async def transfer_candidates(self, user_id: UUID, *, since: date | None) -> list[TransferCandidate]:
    """Unpaired, uncategorized transactions; a category the user chose is never overridden."""
    statement = (
      select(
        Transaction.id,
        Transaction.bank_account_id,
        Transaction.amount,
        Transaction.currency,
        Transaction.direction,
        Transaction.transaction_date,
        BankAccount.is_business,
      )
      .join(BankAccount, BankAccount.id == Transaction.bank_account_id)
      .where(
        Transaction.user_id == user_id,
        Transaction.deleted_at.is_(None),
        Transaction.transfer_id.is_(None),
        Transaction.not_a_transfer.is_(False),
        # A category a rule chose may still turn out to be one side of a transfer; one the user chose never is.
        or_(Transaction.category_id.is_(None), Transaction.category_rule_id.is_not(None)),
        # Card purchases, never money moving out to another of the user's accounts.
        ~((BankAccount.subtype == "credit_card") & (Transaction.direction == TransactionDirection.debit)),
      )
    )
    if since is not None:
      statement = statement.where(Transaction.transaction_date >= since)
    return [TransferCandidate(*row) for row in await self.session.execute(statement)]

  async def rule_candidates(self, user_id: UUID, *, since: date | None) -> list[RuleCandidate]:
    """Uncategorized transactions a rule may sort: not investment accounts' buys and sells, nor paired transfers."""
    statement = (
      select(Transaction.id, Transaction.description, Transaction.direction, BankAccount.is_business)
      .join(BankAccount, BankAccount.id == Transaction.bank_account_id)
      .where(
        Transaction.user_id == user_id,
        Transaction.deleted_at.is_(None),
        Transaction.category_id.is_(None),
        Transaction.transfer_id.is_(None),
        BankAccount.subtype.not_in(INVESTMENT_SUBTYPES),
      )
    )
    if since is not None:
      statement = statement.where(Transaction.transaction_date >= since)
    return [RuleCandidate(*row) for row in await self.session.execute(statement)]

  async def set_category_from_rule(self, transaction_id: UUID, category_id: UUID, *, rule_id: UUID, mark_business: bool) -> None:
    values: dict[str, Any] = {"category_id": category_id, "category_rule_id": rule_id}
    if mark_business:
      values["is_business"] = True
    await self.session.execute(update(Transaction).where(Transaction.id == transaction_id).values(**values))

  async def set_transfer(self, user_id: UUID, ids: Sequence[UUID], transfer_id: UUID) -> int:
    statement = (
      update(Transaction)
      .where(Transaction.user_id == user_id, Transaction.id.in_(ids))
      .values(transfer_id=transfer_id, category_id=None, category_rule_id=None)
    )
    return await self.execute_for_rowcount(statement)

  async def unpair_transfer(self, user_id: UUID, transfer_id: UUID) -> int:
    """Splits a pair for good: both sides count again and are never paired again."""
    statement = update(Transaction).where(Transaction.user_id == user_id, Transaction.transfer_id == transfer_id).values(transfer_id=None, not_a_transfer=True)
    return await self.execute_for_rowcount(statement)

  async def update_amounts(self, user_id: UUID, bank_account_id: UUID, amounts: dict[str, tuple[int, TransactionDirection]]) -> int:
    """Brings already imported rows up to date with their source, by dedup hash; returns how many changed."""
    changed = 0
    for dedup_hash, (amount, direction) in amounts.items():
      statement = (
        update(Transaction)
        .where(
          Transaction.user_id == user_id,
          Transaction.bank_account_id == bank_account_id,
          Transaction.dedup_hash == dedup_hash,
          or_(Transaction.amount != amount, Transaction.direction != direction),
        )
        .values(amount=amount, direction=direction)
      )
      changed += await self.execute_for_rowcount(statement)
    return changed

  async def insert_ignoring_duplicates(self, values: list[dict[str, Any]]) -> int:
    stmt = pg_insert(Transaction).values(values).on_conflict_do_nothing(index_elements=["user_id", "dedup_hash"])
    return await self.execute_for_rowcount(stmt)

  async def count_same_description_with_other_category(
    self,
    *,
    user_id: UUID,
    description: str,
    exclude_id: UUID,
    category_id: UUID | None,
  ) -> int:
    """Count the user's other transactions with the same description but a different category.

    With category_id=None, counts transactions that still have a category set.
    """
    statement = (
      select(func.count())
      .select_from(Transaction)
      .where(
        Transaction.user_id == user_id,
        Transaction.description == description,
        Transaction.id != exclude_id,
      )
    )
    if category_id:
      statement = statement.where(or_(Transaction.category_id != category_id, Transaction.category_id.is_(None)))
    else:
      statement = statement.where(Transaction.category_id.is_not(None))
    result = await self.session.execute(statement)
    return result.scalar() or 0

  async def set_category_for_ids(self, *, user_id: UUID, ids: Sequence[UUID], category_id: UUID | None) -> int:
    statement = update(Transaction).where(Transaction.id.in_(ids), Transaction.user_id == user_id).values(category_id=category_id, category_rule_id=None)
    return await self.execute_for_rowcount(statement)

  async def set_category_for_description(self, *, user_id: UUID, description: str, category_id: UUID | None) -> int:
    statement = (
      update(Transaction).where(Transaction.description == description, Transaction.user_id == user_id).values(category_id=category_id, category_rule_id=None)
    )
    return await self.execute_for_rowcount(statement)

  async def newest_date_for_bank_account(self, bank_account_id: UUID) -> date | None:
    return (await self.session.execute(select(func.max(Transaction.transaction_date)).where(Transaction.bank_account_id == bank_account_id))).scalar_one()

  async def amounts_on_date(self, bank_account_id: UUID, day: date, *, excluding_hash_prefix: str) -> list[tuple[int, TransactionDirection]]:
    """(amount, direction) of the account's transactions on `day`, leaving out those whose dedup hash has the prefix."""
    statement = select(Transaction.amount, Transaction.direction).where(
      Transaction.bank_account_id == bank_account_id,
      Transaction.transaction_date == day,
      Transaction.dedup_hash.not_like(f"{excluding_hash_prefix}%"),
    )
    return [(row.amount, row.direction) for row in await self.session.execute(statement)]

  async def delete_for_bank_account(self, bank_account_id: UUID) -> None:
    await self.session.execute(delete(Transaction).where(Transaction.bank_account_id == bank_account_id))

  async def net_balances_by_account(self, account_ids: Sequence[UUID]) -> dict[UUID, int]:
    """Net transaction sum (credits minus debits) per bank account."""
    if not account_ids:
      return {}
    statement = (
      select(
        Transaction.bank_account_id,
        func.sum(
          case(
            (Transaction.direction == TransactionDirection.credit, Transaction.amount),
            else_=-Transaction.amount,
          )
        ).label("net"),
      )
      .where(Transaction.bank_account_id.in_(account_ids))
      .group_by(Transaction.bank_account_id)
    )
    result = await self.session.execute(statement)
    return {row.bank_account_id: int(row.net) for row in result}

  async def delete_by_ids(self, *, user_id: UUID, ids: Sequence[UUID]) -> int:
    statement = delete(Transaction).where(Transaction.id.in_(ids), Transaction.user_id == user_id)
    return await self.execute_for_rowcount(statement)

  async def spending_by_category(self, *, user_id: UUID, year: int, month: int) -> Sequence[Row]:
    statement = (
      select(
        Transaction.category_id,
        Category.name,
        Category.color,
        func.sum(Transaction.amount).label("total"),
      )
      .join(Category, Transaction.category_id == Category.id)
      .where(
        Transaction.user_id == user_id,
        Transaction.direction == "debit",
        extract("year", Transaction.transaction_date) == year,
        extract("month", Transaction.transaction_date) == month,
      )
      .group_by(Transaction.category_id, Category.name, Category.color)
      .order_by(func.sum(Transaction.amount).desc())
    )
    result = await self.session.execute(_counted_in_reports(statement))
    return result.all()

  async def monthly_flow_totals(self, *, user_id: UUID, start: date) -> Sequence[Row]:
    statement = (
      select(
        extract("year", Transaction.transaction_date).label("yr"),
        extract("month", Transaction.transaction_date).label("mo"),
        Transaction.direction,
        func.sum(Transaction.amount).label("total"),
      )
      .outerjoin(Category, Transaction.category_id == Category.id)
      .where(Transaction.user_id == user_id)
      .where(Transaction.transaction_date >= start)
      .group_by("yr", "mo", Transaction.direction)
      .order_by("yr", "mo")
    )
    result = await self.session.execute(_counted_in_reports(statement))
    return result.all()


class BankProfileRepository(RepositoryBase[BankProfile], RepositoryIDMixin[BankProfile, UUID]):
  model = BankProfile

  async def get_by_bank_name(self, bank_name: str) -> BankProfile | None:
    statement = select(BankProfile).where(BankProfile.bank_name == bank_name)
    return await self.get_one_or_none(statement)
