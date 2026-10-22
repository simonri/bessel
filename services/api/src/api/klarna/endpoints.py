from typing import Annotated, Any

from api.bank_accounts.repository import BankAccountRepository
from api.exceptions import ValidationError
from api.klarna.schemas import KlarnaImportRequest, KlarnaImportResponse
from api.klarna.service import fetch_klarna_items, import_pay_later
from api.postgres import DBSession
from api.users.dependencies import CurrentDBUser
from fastapi import APIRouter, Header

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


@router.post("/import", response_model=KlarnaImportResponse)
async def import_klarna_transactions(
  body: KlarnaImportRequest,
  session: DBSession,
  current_user: CurrentDBUser,
) -> KlarnaImportResponse:
  """
  Fetch Klarna purchases and import the pay later ones into Bessel.
  Skips rejected (isAmountLineThrough) and pending purchases, and ones paid at purchase.
  """
  _require_bearer(body.authorization)

  bank_account = await BankAccountRepository.from_session(session).get_owned_or_404(
    body.bank_account_id, current_user.id, not_found_message="Bank account not found"
  )

  items = await fetch_klarna_items(body.authorization, body.cookie)
  result = await import_pay_later(session, user_id=current_user.id, bank_account_id=bank_account.id, items=items)
  return KlarnaImportResponse(
    created=result.created,
    updated=result.updated,
    paid_at_purchase=result.paid_at_purchase,
    declined=result.declined,
    unrecognized_plans=result.unrecognized_plans,
  )
