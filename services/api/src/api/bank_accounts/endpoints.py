from enum import StrEnum
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from api.bank_accounts.repository import BankAccountRepository
from api.bank_accounts.schemas import BankAccountCreate, BankAccountListResponse, BankAccountSchema, BankAccountUpdate
from api.common.pagination import PaginationParamsQuery
from api.common.sorting import Sorting, SortingGetter
from api.exceptions import ResourceNotFound
from api.models.bank_account import BankAccount
from api.postgres import AsyncSession, get_db_session

router = APIRouter(prefix="/bank-accounts", tags=["bank-accounts"])


class BankAccountSortProperty(StrEnum):
  created_at = "created_at"
  name = "name"


sorting_getter = SortingGetter(BankAccountSortProperty, default_sorting=["name"])


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
  return BankAccountListResponse.from_paginated_results(
    [BankAccountSchema.model_validate(item) for item in items],
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
  return BankAccountSchema.model_validate(account)


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
  return BankAccountSchema.model_validate(account)


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

  return BankAccountSchema.model_validate(account)


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
