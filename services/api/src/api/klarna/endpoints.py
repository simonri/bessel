from typing import Annotated, Any

from api.bank_accounts.repository import BankAccountRepository
from api.exceptions import ResourceNotFound, ValidationError
from api.klarna.schemas import KlarnaImportRequest
from api.klarna.service import fetch_klarna_items, map_to_parsed
from api.postgres import AsyncSession, get_db_session
from api.transactions.schemas import ImportResponse
from api.transactions.service import transaction_service
from api.users.dependencies import CurrentDBUser
from fastapi import APIRouter, Depends, Header

router = APIRouter(prefix="/klarna", tags=["klarna"])


def _require_bearer(authorization: str) -> None:
  if not authorization.lower().startswith("bearer "):
    raise ValidationError("Authorization must be a Bearer token")


@router.get("/transactions")
async def get_klarna_transactions(
  current_user: CurrentDBUser,
  authorization: Annotated[str, Header(description="Klarna Bearer token")],
  cookie: Annotated[str | None, Header(description="Klarna session cookies")] = None,
) -> dict[str, Any]:
  """Fetch Klarna transactions and return raw GraphQL response."""
  _require_bearer(authorization)

  items = await fetch_klarna_items(authorization, cookie)
  return {"data": {"transactionsList": {"items": items}}}


@router.post("/import", response_model=ImportResponse)
async def import_klarna_transactions(
  body: KlarnaImportRequest,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> ImportResponse:
  """
  Fetch Klarna transactions and import them into Bessel.
  Skips rejected (isAmountLineThrough), pending, and duplicate transactions.
  """
  _require_bearer(body.authorization)

  bank_account = await BankAccountRepository.from_session(session).get_by_id(body.bank_account_id)
  if bank_account is None or bank_account.user_id != current_user.id:
    raise ResourceNotFound("Bank account not found")

  items = await fetch_klarna_items(body.authorization, body.cookie)
  parsed = [p for item in items if (p := map_to_parsed(item)) is not None]

  created, skipped = await transaction_service.import_transactions(
    session,
    bank_account_id=bank_account.id,
    bank_name="klarna",
    file_format="klarna_api",
    raw_content=f"[klarna api, {len(items)} items fetched]",
    parsed=parsed,
    user_id=current_user.id,
  )

  return ImportResponse(created=created, skipped=skipped)
