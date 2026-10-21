from uuid import UUID

import httpx
import structlog
from fastapi import APIRouter

from api.bank_accounts.repository import BankAccountRepository
from api.exceptions import ForbiddenError, ServiceUnavailableError, ValidationError
from api.logging import Logger
from api.open_banking.enable_banking import EnableBankingError
from api.open_banking.repository import BankConnectionAccountRepository, BankConnectionRepository
from api.open_banking.schemas import BankAuthorizeResponse, BankCallbackRequest, BankConnectionAccountUpdate, BankConnectionListResponse, BankConnectionSchema
from api.open_banking.service import BANK_NAME, BankConnectError, BankUnavailableError, available_to, open_banking_service
from api.postgres import DBSession
from api.users.dependencies import CurrentDBUser

log: Logger = structlog.get_logger()

router = APIRouter(prefix="/bank-connections", tags=["bank-connections"])


def _require_available(user_id: UUID) -> None:
  if not available_to(user_id):
    raise ForbiddenError("Bank connections aren't available for this account.")


@router.get("", summary="List Bank Connections", response_model=BankConnectionListResponse)
async def list_bank_connections(session: DBSession, current_user: CurrentDBUser) -> BankConnectionListResponse:
  connections = await BankConnectionRepository.from_session(session).list_for_user(current_user.id)
  return BankConnectionListResponse(
    available=available_to(current_user.id),
    connections=[BankConnectionSchema.model_validate(c) for c in connections],
  )


@router.post("/authorize", summary="Start Bank Connection", response_model=BankAuthorizeResponse)
async def authorize_bank_connection(current_user: CurrentDBUser) -> BankAuthorizeResponse:
  _require_available(current_user.id)
  try:
    return BankAuthorizeResponse(url=await open_banking_service.start_connection(current_user.id))
  except (BankUnavailableError, EnableBankingError, httpx.HTTPError) as e:
    log.exception("enable_banking_authorize_failed")
    raise ServiceUnavailableError(f"Couldn't start the {BANK_NAME} connection. Try again in a moment.", status_code=502) from e


@router.post("/callback", summary="Complete Bank Connection", response_model=BankConnectionSchema, status_code=201)
async def complete_bank_connection(body: BankCallbackRequest, session: DBSession, current_user: CurrentDBUser) -> BankConnectionSchema:
  _require_available(current_user.id)
  connections = BankConnectionRepository.from_session(session)
  try:
    connection = await open_banking_service.complete_connection(connections, current_user.id, code=body.code, state=body.state)
  except BankConnectError as e:
    raise ValidationError(str(e)) from e
  except (EnableBankingError, httpx.HTTPError) as e:
    log.exception("enable_banking_connect_failed")
    raise ServiceUnavailableError(f"{BANK_NAME} couldn't complete the approval. Try again from Bessel.", status_code=502) from e
  if any(account.bank_account_id for account in connection.accounts):
    open_banking_service.request_sync(connection.id)
  return BankConnectionSchema.model_validate(await connections.get_owned(connection.id, current_user.id))


@router.patch("/accounts/{account_id}", summary="Link Bank Connection Account", response_model=BankConnectionSchema)
async def link_bank_connection_account(
  account_id: UUID,
  body: BankConnectionAccountUpdate,
  session: DBSession,
  current_user: CurrentDBUser,
) -> BankConnectionSchema:
  account = await BankConnectionAccountRepository.from_session(session).get_owned(account_id, current_user.id)
  bank_account = None
  if body.bank_account_id is not None:
    bank_account = await BankAccountRepository.from_session(session).get_owned_or_404(
      body.bank_account_id, current_user.id, not_found_message="Bank account not found"
    )
  await open_banking_service.link_account(session, account, bank_account)
  await session.flush()
  if bank_account is not None:
    open_banking_service.request_sync(account.connection_id)
  connections = BankConnectionRepository.from_session(session)
  connection = await connections.get_owned(account.connection_id, current_user.id)
  await session.refresh(connection, ["accounts"])
  return BankConnectionSchema.model_validate(connection)


@router.post("/{connection_id}/sync", summary="Sync Bank Connection", status_code=202)
async def sync_bank_connection(connection_id: UUID, session: DBSession, current_user: CurrentDBUser) -> None:
  connection = await BankConnectionRepository.from_session(session).get_owned(connection_id, current_user.id)
  open_banking_service.request_sync(connection.id)


@router.delete("/{connection_id}", summary="Disconnect Bank Connection", status_code=204)
async def disconnect_bank_connection(connection_id: UUID, session: DBSession, current_user: CurrentDBUser) -> None:
  connections = BankConnectionRepository.from_session(session)
  await open_banking_service.disconnect(connections, await connections.get_owned(connection_id, current_user.id))
