from uuid import UUID

import httpx
import structlog
from fastapi import APIRouter

from api.bank_accounts.repository import BankAccountRepository
from api.common.utils import utc_now
from api.exceptions import ConflictError, ResourceNotFound, ServiceUnavailableError, TooManyRequestsError, ValidationError
from api.logging import Logger
from api.models.montrose import MontroseConnection
from api.montrose.client import MontroseAuthError, MontroseError
from api.montrose.repository import MontroseAccountRepository, MontroseConnectionRepository
from api.montrose.schemas import MontroseAccountUpdate, MontroseAuthorizeResponse, MontroseCallbackRequest, MontroseConnectionSchema, MontroseStatusResponse
from api.montrose.service import MontroseConflictError, MontroseStateError, consent_expires_at, montrose_service
from api.postgres import DBSession
from api.users.dependencies import CurrentDBUser

log: Logger = structlog.get_logger()

router = APIRouter(prefix="/montrose", tags=["montrose"])


def _schema(connection: MontroseConnection) -> MontroseConnectionSchema:
  return MontroseConnectionSchema.model_validate(
    {
      "id": connection.id,
      "rejected": connection.rejected_at is not None,
      "consent_expires_at": consent_expires_at(connection),
      "last_synced_at": connection.last_synced_at,
      "sync_error": connection.sync_error,
      "accounts": connection.accounts,
    }
  )


async def _owned(connections: MontroseConnectionRepository, user_id: UUID) -> MontroseConnection:
  connection = await connections.get_for_user(user_id)
  if connection is None:
    raise ResourceNotFound("Montrose isn't connected")
  return connection


@router.get("", summary="Get Montrose Connection", response_model=MontroseStatusResponse)
async def get_montrose(session: DBSession, current_user: CurrentDBUser) -> MontroseStatusResponse:
  connection = await MontroseConnectionRepository.from_session(session).get_for_user(current_user.id)
  return MontroseStatusResponse(connection=_schema(connection) if connection else None)


@router.post("/authorize", summary="Start Montrose Connection", response_model=MontroseAuthorizeResponse)
async def authorize_montrose(current_user: CurrentDBUser) -> MontroseAuthorizeResponse:
  """Starts the BankID consent; Montrose sends the user back to Bessel's callback page."""
  try:
    url = await montrose_service.start(current_user.id)
  except (MontroseError, httpx.HTTPError, KeyError, ValueError) as e:
    log.warning("montrose_authorize_failed", error=type(e).__name__)
    raise ServiceUnavailableError("Couldn't reach Montrose. Try again in a moment.", status_code=502) from e
  return MontroseAuthorizeResponse(url=url)


@router.post("/callback", summary="Complete Montrose Connection", response_model=MontroseConnectionSchema, status_code=201)
async def complete_montrose(body: MontroseCallbackRequest, session: DBSession, current_user: CurrentDBUser) -> MontroseConnectionSchema:
  connections = MontroseConnectionRepository.from_session(session)
  try:
    connection = await montrose_service.complete(connections, current_user.id, code=body.code, state=body.state, issuer=body.iss, now=utc_now())
  except MontroseStateError as e:
    raise ValidationError(str(e)) from e
  except MontroseAuthError as e:
    raise ValidationError("Montrose didn't accept the login. Start again from Bessel.") from e
  except (MontroseError, httpx.HTTPError, KeyError, TypeError, ValueError) as e:
    log.warning("montrose_callback_failed", error=type(e).__name__)
    raise ServiceUnavailableError("Couldn't reach Montrose. Try again in a moment.", status_code=502) from e
  if any(account.bank_account_id for account in connection.accounts):
    montrose_service.request_sync(connection.id)
  return _schema(await _owned(connections, current_user.id))


@router.patch("/accounts/{account_id}", summary="Link Montrose Account", response_model=MontroseConnectionSchema)
async def link_montrose_account(account_id: UUID, body: MontroseAccountUpdate, session: DBSession, current_user: CurrentDBUser) -> MontroseConnectionSchema:
  account = await MontroseAccountRepository.from_session(session).get_owned(account_id, current_user.id)
  bank_account = None
  if body.bank_account_id is not None:
    bank_account = await BankAccountRepository.from_session(session).get_owned_or_404(
      body.bank_account_id, current_user.id, not_found_message="Bank account not found"
    )
  try:
    await montrose_service.link_account(session, account, bank_account)
  except MontroseConflictError as e:
    raise ConflictError(str(e)) from e
  await session.flush()
  if bank_account is not None:
    montrose_service.request_sync(account.connection_id)
  connections = MontroseConnectionRepository.from_session(session)
  connection = await _owned(connections, current_user.id)
  await session.refresh(connection, ["accounts"])
  return _schema(connection)


@router.post("/sync", summary="Sync Montrose", status_code=202)
async def sync_montrose(session: DBSession, current_user: CurrentDBUser) -> None:
  connection = await _owned(MontroseConnectionRepository.from_session(session), current_user.id)
  if connection.rejected_at is not None:
    raise ValidationError("Log in to Montrose with BankID again first.")
  if not montrose_service.can_sync_now(connection, now=utc_now()):
    raise TooManyRequestsError("Montrose synced a moment ago. Try again shortly.")
  montrose_service.request_sync(connection.id)


@router.delete("", summary="Disconnect Montrose", status_code=204)
async def disconnect_montrose(session: DBSession, current_user: CurrentDBUser) -> None:
  """Forgets the consent and its tokens. Imported transactions stay."""
  connections = MontroseConnectionRepository.from_session(session)
  await connections.delete(await _owned(connections, current_user.id), flush=True)
