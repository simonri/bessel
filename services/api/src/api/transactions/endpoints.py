from enum import StrEnum
from typing import Annotated
from uuid import UUID

from api.common.pagination import PaginationParamsQuery
from api.common.sorting import Sorting, SortingGetter
from api.exceptions import ResourceNotFound
from api.models.bank_profile import BankProfile
from api.models.transaction import Transaction
from api.postgres import AsyncSession, get_db_session
from api.transactions.parsers.csv_parser import parse_csv
from api.transactions.parsers.xlsx_parser import parse_xlsx
from api.transactions.schemas import (
  BulkCategorizeRequest,
  BulkCategorizeResponse,
  BulkDeleteRequest,
  ImportResponse,
  TransactionListResponse,
  TransactionSchema,
  TransactionUpdate,
  TransactionUpdateResponse,
)
from api.transactions.service import transaction_service
from fastapi import APIRouter, Depends, Query, UploadFile
from sqlalchemy import delete, func, or_, select, update

router = APIRouter(prefix="/transactions", tags=["transactions"])


class TransactionSortProperty(StrEnum):
  created_at = "created_at"
  transaction_date = "transaction_date"
  amount = "amount"
  description = "description"


sorting_getter = SortingGetter(TransactionSortProperty, default_sorting=["-transaction_date"])


@router.get(
  "",
  summary="List Transactions",
  response_model=TransactionListResponse,
)
async def list_transactions(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  pagination: PaginationParamsQuery,
  sorting: Annotated[list[Sorting[TransactionSortProperty]], Depends(sorting_getter)],
  bank_account_id: UUID | None = Query(None, description="Filter by bank account ID."),
) -> TransactionListResponse:
  """List transactions."""
  from api.transactions.repository import TransactionRepository

  repo = TransactionRepository.from_session(session)
  statement = repo.get_base_statement()

  if bank_account_id is not None:
    statement = statement.where(Transaction.bank_account_id == bank_account_id)

  for prop, desc in sorting:
    column = getattr(Transaction, prop.value)
    statement = statement.order_by(column.desc() if desc else column.asc())
  # Stable tiebreaker so row order never shifts after unrelated updates (e.g. category)
  statement = statement.order_by(Transaction.id)

  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  return TransactionListResponse.from_paginated_results(
    [TransactionSchema.model_validate(item) for item in items],
    total_count,
    pagination,
  )


@router.post(
  "/import",
  summary="Import Transactions",
  response_model=ImportResponse,
)
async def import_transactions(
  file: UploadFile,
  bank: Annotated[str, Query(description="Bank identifier, e.g. 'marginalen'.")],
  bank_account_id: Annotated[UUID, Query(description="Bank account to attach transactions to.")],
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ImportResponse:
  """Import transactions from a bank export (CSV or XLSX).

  Duplicate transactions (by dedup hash) are automatically skipped.
  """
  result = await session.execute(select(BankProfile).where(BankProfile.bank_name == bank))
  profile = result.scalar_one_or_none()
  if profile is None:
    raise ResourceNotFound(f"Unknown bank profile: {bank}")

  content = await file.read()

  if profile.file_format == "xlsx":
    # Parse Excel file
    parsed = await parse_xlsx(content, profile)
    raw_content = f"[xlsx binary, {len(content)} bytes]"
  else:
    # Parse CSV file
    try:
      text = content.decode("utf-8")
    except UnicodeDecodeError:
      text = content.decode("latin-1")
    parsed = await parse_csv(text, profile)
    raw_content = text

  # Store raw, map & normalize, deduplicate
  created, skipped = await transaction_service.import_transactions(
    session,
    bank_account_id=bank_account_id,
    bank_name=profile.bank_name,
    file_format=profile.file_format,
    raw_content=raw_content,
    parsed=parsed,
  )

  return ImportResponse(created=created, skipped=skipped)


@router.patch(
  "/{transaction_id}",
  summary="Update Transaction",
  response_model=TransactionUpdateResponse,
)
async def update_transaction(
  transaction_id: UUID,
  body: TransactionUpdate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TransactionUpdateResponse:
  """Update a transaction."""
  from api.transactions.repository import TransactionRepository

  repo = TransactionRepository.from_session(session)
  transaction = await repo.get_by_id(transaction_id)
  if transaction is None:
    raise ResourceNotFound("Transaction not found")

  update_dict = body.model_dump(exclude_unset=True)
  if update_dict:
    await repo.update(transaction, update_dict=update_dict)

  same_description_count = 0
  if transaction.description and "category_id" in update_dict:
    new_category_id = update_dict["category_id"]
    count_stmt = (
      select(func.count())
      .select_from(Transaction)
      .where(
        Transaction.description == transaction.description,
        Transaction.id != transaction.id,
      )
    )
    if new_category_id:
      count_stmt = count_stmt.where(
        or_(Transaction.category_id != new_category_id, Transaction.category_id.is_(None))
      )
    else:
      count_stmt = count_stmt.where(Transaction.category_id.is_not(None))

    result = await session.execute(count_stmt)
    same_description_count = result.scalar() or 0

  return TransactionUpdateResponse(
    **TransactionSchema.model_validate(transaction).model_dump(),
    same_description_count=same_description_count,
  )


@router.post(
  "/categorize-by-description",
  summary="Bulk Categorize by Description",
  response_model=BulkCategorizeResponse,
)
async def categorize_by_description(
  body: BulkCategorizeRequest,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BulkCategorizeResponse:
  """Set category for all transactions matching the given description."""
  stmt = (
    update(Transaction)
    .where(Transaction.description == body.description)
    .values(category_id=body.category_id)
  )
  result = await session.execute(stmt)
  return BulkCategorizeResponse(updated=result.rowcount)


@router.delete(
  "",
  summary="Delete Transactions",
  status_code=204,
)
async def delete_transactions(
  body: BulkDeleteRequest,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
  """Delete transactions by IDs."""
  result = await session.execute(delete(Transaction).where(Transaction.id.in_(body.ids)))
  if result.rowcount == 0:
    raise ResourceNotFound("No transactions found")
