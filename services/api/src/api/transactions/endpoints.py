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
from api.transactions.schemas import BulkDeleteRequest, ImportResponse, TransactionListResponse, TransactionSchema
from api.transactions.service import transaction_service
from fastapi import APIRouter, Depends, Query, UploadFile
from sqlalchemy import delete, select

router = APIRouter(prefix="/transactions", tags=["transactions"])


class TransactionSortProperty(StrEnum):
  created_at = "created_at"
  transaction_date = "transaction_date"
  amount = "amount"


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

  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  return TransactionListResponse.from_paginated_results(
    [TransactionSchema.model_validate(item) for item in items],
    total_count,
    pagination,
  )


@router.post(
  "/import",
  summary="Import Transactions from CSV",
  response_model=ImportResponse,
)
async def import_transactions(
  file: UploadFile,
  bank: Annotated[str, Query(description="Bank identifier, e.g. 'marginalen'.")],
  bank_account_id: Annotated[UUID, Query(description="Bank account to attach transactions to.")],
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ImportResponse:
  """Import transactions from a bank CSV export.

  Duplicate transactions (by dedup hash) are automatically skipped.
  """
  result = await session.execute(select(BankProfile).where(BankProfile.bank_name == bank))
  profile = result.scalar_one_or_none()
  if profile is None:
    raise ResourceNotFound(f"Unknown bank profile: {bank}")

  content = await file.read()
  try:
    text = content.decode("utf-8")
  except UnicodeDecodeError:
    text = content.decode("latin-1")

  # 1. Parse file using bank profile
  parsed = await parse_csv(text, profile)

  # 2-3. Store raw, map & normalize, deduplicate
  created, skipped = await transaction_service.import_transactions(
    session,
    bank_account_id=bank_account_id,
    bank_name=profile.bank_name,
    file_format=profile.file_format,
    raw_content=text,
    parsed=parsed,
  )

  return ImportResponse(created=created, skipped=skipped)


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
