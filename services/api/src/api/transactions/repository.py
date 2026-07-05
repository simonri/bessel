from collections.abc import Sequence
from datetime import date
from typing import Any
from uuid import UUID

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.bank_profile import BankProfile
from api.models.category import Category
from api.models.transaction import Transaction, TransactionDirection
from sqlalchemy import Row, case, delete, extract, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert


class TransactionRepository(RepositoryBase[Transaction], RepositoryIDMixin[Transaction, UUID]):
  model = Transaction

  async def insert_ignoring_duplicates(self, values: list[dict[str, Any]]) -> int:
    stmt = pg_insert(Transaction).values(values).on_conflict_do_nothing(index_elements=["user_id", "dedup_hash"])
    result = await self.session.execute(stmt)
    return result.rowcount

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
    statement = update(Transaction).where(Transaction.id.in_(ids), Transaction.user_id == user_id).values(category_id=category_id)
    result = await self.session.execute(statement)
    return result.rowcount

  async def set_category_for_description(self, *, user_id: UUID, description: str, category_id: UUID | None) -> int:
    statement = update(Transaction).where(Transaction.description == description, Transaction.user_id == user_id).values(category_id=category_id)
    result = await self.session.execute(statement)
    return result.rowcount

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
    result = await self.session.execute(statement)
    return result.rowcount

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
    result = await self.session.execute(statement)
    return result.all()

  async def monthly_flow_totals(self, *, user_id: UUID, start: date) -> Sequence[Row]:
    statement = (
      select(
        extract("year", Transaction.transaction_date).label("yr"),
        extract("month", Transaction.transaction_date).label("mo"),
        Transaction.direction,
        func.sum(Transaction.amount).label("total"),
      )
      .where(Transaction.user_id == user_id)
      .where(Transaction.transaction_date >= start)
      .group_by("yr", "mo", Transaction.direction)
      .order_by("yr", "mo")
    )
    result = await self.session.execute(statement)
    return result.all()


class BankProfileRepository(RepositoryBase[BankProfile], RepositoryIDMixin[BankProfile, UUID]):
  model = BankProfile

  async def get_by_bank_name(self, bank_name: str) -> BankProfile | None:
    statement = select(BankProfile).where(BankProfile.bank_name == bank_name)
    return await self.get_one_or_none(statement)
