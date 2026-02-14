from enum import StrEnum
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select

from api.bank_accounts.repository import BankAccountRepository
from api.bank_accounts.schemas import BankAccountCreate, BankAccountListResponse, BankAccountSchema, BankAccountUpdate
from api.common.pagination import PaginationParamsQuery
from api.common.sorting import Sorting, SortingGetter
from api.exceptions import ResourceNotFound
from api.models.bank_account import BankAccount
from api.models.transaction import Transaction, TransactionDirection
from api.postgres import AsyncSession, get_db_session

router = APIRouter(prefix="/bank-accounts", tags=["bank-accounts"])


class BankAccountSortProperty(StrEnum):
  created_at = "created_at"
  name = "name"


sorting_getter = SortingGetter(BankAccountSortProperty, default_sorting=["name"])


def _balance_subquery(account_id_col):
  """Subquery that sums transaction amounts (credits - debits) for a bank account."""
  return (
    select(
      func.coalesce(
        func.sum(
          case(
            (Transaction.direction == TransactionDirection.credit, Transaction.amount),
            else_=-Transaction.amount,
          )
        ),
        0,
      )
    )
    .where(Transaction.bank_account_id == account_id_col)
    .correlate(BankAccount)
    .scalar_subquery()
  )


async def _get_balances(session: AsyncSession, account_ids: list[UUID]) -> dict[UUID, int]:
  """Fetch transaction balance sums for a list of account IDs."""
  if not account_ids:
    return {}
  stmt = (
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
  result = await session.execute(stmt)
  return {row.bank_account_id: int(row.net) for row in result}


def _to_schema(account: BankAccount, balance: int) -> BankAccountSchema:
  data = BankAccountSchema.model_validate(account)
  data.current_balance = account.base_balance + balance
  return data


@router.get(
  "",
  summary="List Bank Accounts",
  response_model=BankAccountListResponse,
)
async def list_bank_accounts(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  pagination: PaginationParamsQuery,
  sorting: Annotated[list[Sorting[BankAccountSortProperty]], Depends(sorting_getter)],
) -> BankAccountListResponse:
  """List all bank accounts."""
  repo = BankAccountRepository.from_session(session)
  statement = repo.get_base_statement()

  for prop, desc in sorting:
    column = getattr(BankAccount, prop.value)
    statement = statement.order_by(column.desc() if desc else column.asc())

  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  balances = await _get_balances(session, [a.id for a in items])
  return BankAccountListResponse.from_paginated_results(
    [_to_schema(item, balances.get(item.id, 0)) for item in items],
    total_count,
    pagination,
  )


@router.get(
  "/{bank_account_id}",
  summary="Get Bank Account",
  response_model=BankAccountSchema,
)
async def get_bank_account(
  bank_account_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BankAccountSchema:
  """Get a bank account by ID."""
  repo = BankAccountRepository.from_session(session)
  account = await repo.get_by_id(bank_account_id)
  if account is None:
    raise ResourceNotFound("Bank account not found")
  balances = await _get_balances(session, [account.id])
  return _to_schema(account, balances.get(account.id, 0))


@router.post(
  "",
  summary="Create Bank Account",
  response_model=BankAccountSchema,
  status_code=201,
)
async def create_bank_account(
  body: BankAccountCreate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BankAccountSchema:
  """Create a new bank account."""
  repo = BankAccountRepository.from_session(session)
  account = BankAccount(
    name=body.name,
    currency=body.currency,
    base_balance=body.base_balance,
    subtype=body.subtype,
  )
  await repo.create(account, flush=True)
  return _to_schema(account, 0)


@router.patch(
  "/{bank_account_id}",
  summary="Update Bank Account",
  response_model=BankAccountSchema,
)
async def update_bank_account(
  bank_account_id: UUID,
  body: BankAccountUpdate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BankAccountSchema:
  """Update a bank account."""
  repo = BankAccountRepository.from_session(session)
  account = await repo.get_by_id(bank_account_id)
  if account is None:
    raise ResourceNotFound("Bank account not found")

  update_dict = body.model_dump(exclude_unset=True)
  if update_dict:
    await repo.update(account, update_dict=update_dict)

  balances = await _get_balances(session, [account.id])
  return _to_schema(account, balances.get(account.id, 0))


@router.delete(
  "/{bank_account_id}",
  summary="Delete Bank Account",
  status_code=204,
)
async def delete_bank_account(
  bank_account_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
  """Delete a bank account."""
  repo = BankAccountRepository.from_session(session)
  account = await repo.get_by_id(bank_account_id)
  if account is None:
    raise ResourceNotFound("Bank account not found")
  await session.delete(account)
