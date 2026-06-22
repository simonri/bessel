from datetime import date
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from api.common.pagination import PaginationParamsQuery
from api.common.sorting import Sorting, SortingGetter
from api.exceptions import ResourceNotFound
from api.models.bank_profile import BankProfile
from api.models.category import Category
from api.models.transaction import Transaction
from api.postgres import AsyncSession, get_db_session
from api.transactions.parsers.csv_parser import parse_csv
from api.transactions.parsers.xlsx_parser import parse_xlsx
from api.transactions.schemas import (
  BulkCategorizeRequest,
  BulkCategorizeResponse,
  BulkDeleteRequest,
  BulkUpdateRequest,
  BulkUpdateResponse,
  CategorySpending,
  ImportResponse,
  MonthlyFlow,
  MonthlyFlowResponse,
  MonthlySpendingResponse,
  TransactionListResponse,
  TransactionSchema,
  TransactionUpdate,
  TransactionUpdateResponse,
)
from api.transactions.service import transaction_service
from fastapi import APIRouter, Depends, Query, UploadFile
from sqlalchemy import delete, extract, func, or_, select, update

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
  bank_account_id: Annotated[list[UUID] | None, Query(description="Filter by bank account ID(s).")] = None,
  category_id: Annotated[list[UUID] | None, Query(description="Filter by category ID(s).")] = None,
  uncategorized: bool = Query(False, description="If true, only show transactions without a category."),
  direction: Annotated[str | None, Query(description="Filter by direction: 'debit' or 'credit'.")] = None,
  search: Annotated[str | None, Query(description="Search in description (case-insensitive).")] = None,
  date_from: Annotated[date | None, Query(description="Start date (inclusive).")] = None,
  date_to: Annotated[date | None, Query(description="End date (inclusive).")] = None,
  is_business: Annotated[bool | None, Query(description="Filter by business flag.")] = None,
) -> TransactionListResponse:
  """List transactions."""
  from api.transactions.repository import TransactionRepository

  repo = TransactionRepository.from_session(session)
  statement = repo.get_base_statement()

  if bank_account_id:
    statement = statement.where(Transaction.bank_account_id.in_(bank_account_id))
  if category_id:
    statement = statement.where(Transaction.category_id.in_(category_id))
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
      count_stmt = count_stmt.where(or_(Transaction.category_id != new_category_id, Transaction.category_id.is_(None)))
    else:
      count_stmt = count_stmt.where(Transaction.category_id.is_not(None))

    result = await session.execute(count_stmt)
    same_description_count = result.scalar() or 0

  return TransactionUpdateResponse(
    **TransactionSchema.model_validate(transaction).model_dump(),
    same_description_count=same_description_count,
  )


@router.patch(
  "/bulk",
  summary="Bulk Update Transactions",
  response_model=BulkUpdateResponse,
)
async def bulk_update_transactions(
  body: BulkUpdateRequest,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BulkUpdateResponse:
  """Update category for a list of transactions by ID."""
  stmt = update(Transaction).where(Transaction.id.in_(body.ids)).values(category_id=body.category_id)
  result = await session.execute(stmt)
  return BulkUpdateResponse(updated=result.rowcount)


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
  stmt = update(Transaction).where(Transaction.description == body.description).values(category_id=body.category_id)
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


@router.get(
  "/spending-by-category",
  summary="Monthly Spending by Category",
  response_model=MonthlySpendingResponse,
)
async def spending_by_category(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  year: int = Query(description="Year to query."),
  month: int = Query(description="Month to query (1-12)."),
) -> MonthlySpendingResponse:
  """Aggregate debit spending per category for a given month."""
  stmt = (
    select(
      Transaction.category_id,
      Category.name,
      Category.color,
      func.sum(Transaction.amount).label("total"),
    )
    .join(Category, Transaction.category_id == Category.id)
    .where(
      Transaction.direction == "debit",
      extract("year", Transaction.transaction_date) == year,
      extract("month", Transaction.transaction_date) == month,
    )
    .group_by(Transaction.category_id, Category.name, Category.color)
    .order_by(func.sum(Transaction.amount).desc())
  )
  result = await session.execute(stmt)
  items = [
    CategorySpending(
      category_id=row.category_id,
      category_name=row.name,
      category_color=row.color,
      total=row.total,
    )
    for row in result.all()
  ]
  return MonthlySpendingResponse(year=year, month=month, items=items)


@router.get(
  "/monthly-flow",
  summary="Monthly Income & Expenses",
  response_model=MonthlyFlowResponse,
)
async def monthly_flow(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  months: int = Query(6, description="Number of months to look back (including current)."),
) -> MonthlyFlowResponse:
  """Return income and expenses aggregated per month."""
  from dateutil.relativedelta import relativedelta

  today = date.today()
  start = today.replace(day=1) - relativedelta(months=months - 1)

  stmt = (
    select(
      extract("year", Transaction.transaction_date).label("yr"),
      extract("month", Transaction.transaction_date).label("mo"),
      Transaction.direction,
      func.sum(Transaction.amount).label("total"),
    )
    .where(Transaction.transaction_date >= start)
    .group_by("yr", "mo", Transaction.direction)
    .order_by("yr", "mo")
  )
  result = await session.execute(stmt)

  buckets: dict[tuple[int, int], dict[str, int]] = {}
  for row in result.all():
    key = (int(row.yr), int(row.mo))
    if key not in buckets:
      buckets[key] = {"income": 0, "expenses": 0}
    if row.direction == "credit":
      buckets[key]["income"] = row.total
    else:
      buckets[key]["expenses"] = row.total

  # Fill in missing months with zeros
  items: list[MonthlyFlow] = []
  cursor = start
  while cursor <= today:
    key = (cursor.year, cursor.month)
    b = buckets.get(key, {"income": 0, "expenses": 0})
    items.append(MonthlyFlow(year=cursor.year, month=cursor.month, **b))
    cursor += relativedelta(months=1)

  return MonthlyFlowResponse(items=items)
