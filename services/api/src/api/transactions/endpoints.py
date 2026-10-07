from datetime import date
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from api.bank_accounts.repository import BankAccountRepository
from api.common.pagination import PaginationParamsQuery
from api.common.sorting import Sorting, SortingGetter, apply_sorting
from api.common.uploads import read_upload
from api.exceptions import ResourceNotFound
from api.models.transaction import Transaction
from api.postgres import DBSession
from api.transactions.parsers.csv_parser import parse_csv
from api.transactions.parsers.xlsx_parser import parse_xlsx
from api.transactions.repository import BankProfileRepository, TransactionRepository
from api.transactions.schemas import (
  BulkCategorizeRequest,
  BulkCategorizeResponse,
  BulkDeleteRequest,
  BulkUpdateRequest,
  BulkUpdateResponse,
  CategorySpending,
  ImportResponse,
  MonthlyFlowResponse,
  MonthlySpendingResponse,
  TransactionListResponse,
  TransactionSchema,
  TransactionUpdate,
  TransactionUpdateResponse,
)
from api.transactions.service import transaction_service
from api.users.dependencies import CurrentDBUser
from fastapi import APIRouter, Depends, Query, UploadFile

router = APIRouter(prefix="/transactions", tags=["transactions"])

MAX_IMPORT_SIZE_BYTES = 10 * 1024 * 1024


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
  session: DBSession,
  current_user: CurrentDBUser,
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
  repo = TransactionRepository.from_session(session)
  statement = repo.get_filtered_statement(
    current_user.id,
    bank_account_ids=bank_account_id,
    category_ids=category_id,
    uncategorized=uncategorized,
    direction=direction,
    search=search,
    date_from=date_from,
    date_to=date_to,
    is_business=is_business,
  )

  statement = apply_sorting(statement, Transaction, sorting)
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
  session: DBSession,
  current_user: CurrentDBUser,
) -> ImportResponse:
  """Import transactions from a bank export (CSV or XLSX).

  Duplicate transactions (by dedup hash) are automatically skipped.
  """
  await BankAccountRepository.from_session(session).get_owned_or_404(bank_account_id, current_user.id, not_found_message="Bank account not found")
  profile = await BankProfileRepository.from_session(session).get_by_bank_name(bank)
  if profile is None:
    raise ResourceNotFound(f"Unknown bank profile: {bank}")

  content = await read_upload(file, MAX_IMPORT_SIZE_BYTES, "File is too large (max 10 MB).")

  if profile.file_format == "xlsx":
    parsed = await parse_xlsx(content, profile)
    raw_content = f"[xlsx binary, {len(content)} bytes]"
  else:
    try:
      text = content.decode("utf-8")
    except UnicodeDecodeError:
      text = content.decode("latin-1")
    parsed = await parse_csv(text, profile)
    raw_content = text

  created, skipped = await transaction_service.import_transactions(
    session,
    bank_account_id=bank_account_id,
    bank_name=profile.bank_name,
    file_format=profile.file_format,
    raw_content=raw_content,
    parsed=parsed,
    user_id=current_user.id,
  )

  return ImportResponse(created=created, skipped=skipped)


# Registered before /{transaction_id} — FastAPI matches routes in definition order,
# and "/bulk" would otherwise be captured (and 422) as a transaction_id.
@router.patch(
  "/bulk",
  summary="Bulk Update Transactions",
  response_model=BulkUpdateResponse,
)
async def bulk_update_transactions(
  body: BulkUpdateRequest,
  session: DBSession,
  current_user: CurrentDBUser,
) -> BulkUpdateResponse:
  """Update category for a list of transactions by ID."""
  repo = TransactionRepository.from_session(session)
  updated = await repo.set_category_for_ids(user_id=current_user.id, ids=body.ids, category_id=body.category_id)
  return BulkUpdateResponse(updated=updated)


@router.patch(
  "/{transaction_id}",
  summary="Update Transaction",
  response_model=TransactionUpdateResponse,
)
async def update_transaction(
  transaction_id: UUID,
  body: TransactionUpdate,
  session: DBSession,
  current_user: CurrentDBUser,
) -> TransactionUpdateResponse:
  """Update a transaction."""
  repo = TransactionRepository.from_session(session)
  transaction = await repo.get_owned_or_404(transaction_id, current_user.id, not_found_message="Transaction not found")

  update_dict = body.model_dump(exclude_unset=True)
  if update_dict:
    await repo.update(transaction, update_dict=update_dict)

  same_description_count = 0
  if transaction.description and "category_id" in update_dict:
    same_description_count = await repo.count_same_description_with_other_category(
      user_id=current_user.id,
      description=transaction.description,
      exclude_id=transaction.id,
      category_id=update_dict["category_id"],
    )

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
  session: DBSession,
  current_user: CurrentDBUser,
) -> BulkCategorizeResponse:
  """Set category for all transactions matching the given description."""
  repo = TransactionRepository.from_session(session)
  updated = await repo.set_category_for_description(user_id=current_user.id, description=body.description, category_id=body.category_id)
  return BulkCategorizeResponse(updated=updated)


@router.delete(
  "",
  summary="Delete Transactions",
  status_code=204,
)
async def delete_transactions(
  body: BulkDeleteRequest,
  session: DBSession,
  current_user: CurrentDBUser,
) -> None:
  """Delete transactions by IDs."""
  repo = TransactionRepository.from_session(session)
  deleted = await repo.delete_by_ids(user_id=current_user.id, ids=body.ids)
  if deleted == 0:
    raise ResourceNotFound("No transactions found")


@router.get(
  "/spending-by-category",
  summary="Monthly Spending by Category",
  response_model=MonthlySpendingResponse,
)
async def spending_by_category(
  session: DBSession,
  current_user: CurrentDBUser,
  year: int = Query(description="Year to query."),
  month: int = Query(description="Month to query (1-12)."),
) -> MonthlySpendingResponse:
  """Aggregate debit spending per category for a given month."""
  repo = TransactionRepository.from_session(session)
  rows = await repo.spending_by_category(user_id=current_user.id, year=year, month=month)
  items = [
    CategorySpending(
      category_id=row.category_id,
      category_name=row.name,
      category_color=row.color,
      total=row.total,
    )
    for row in rows
  ]
  return MonthlySpendingResponse(year=year, month=month, items=items)


@router.get(
  "/monthly-flow",
  summary="Monthly Income & Expenses",
  response_model=MonthlyFlowResponse,
)
async def monthly_flow(
  session: DBSession,
  current_user: CurrentDBUser,
  months: int = Query(6, description="Number of months to look back (including current)."),
) -> MonthlyFlowResponse:
  """Return income and expenses aggregated per month."""
  items = await transaction_service.monthly_flow(TransactionRepository.from_session(session), current_user.id, months=months, today=date.today())
  return MonthlyFlowResponse(items=items)
