from uuid import UUID

import httpx
import structlog
from fastapi import APIRouter

from api.avanza.client import AvanzaAuthError, AvanzaError
from api.avanza.repository import AvanzaAccountRepository, AvanzaConnectionRepository
from api.avanza.schemas import AvanzaAccountUpdate, AvanzaConnectionSchema, AvanzaConnectRequest, AvanzaStatusResponse
from api.avanza.service import AvanzaConflictError, available_to, avanza_service
from api.bank_accounts.repository import BankAccountRepository
from api.common.utils import utc_now
from api.exceptions import ConflictError, ForbiddenError, ResourceNotFound, ServiceUnavailableError, TooManyRequestsError, ValidationError
from api.logging import Logger
from api.models.avanza import AvanzaConnection
from api.postgres import DBSession
from api.users.dependencies import CurrentDBUser

log: Logger = structlog.get_logger()

router = APIRouter(prefix="/avanza", tags=["avanza"])


def _require_available(user_id: UUID) -> None:
  if not available_to(user_id):
    raise ForbiddenError("Avanza isn't available for this account.")


def _schema(connection: AvanzaConnection) -> AvanzaConnectionSchema:
  return AvanzaConnectionSchema.model_validate(
    {
      "id": connection.id,
      "username": connection.username,
      "credentials_rejected": connection.credentials_rejected_at is not None,
      "last_synced_at": connection.last_synced_at,
      "sync_error": connection.sync_error,
      "accounts": connection.accounts,
    }
  )


async def _owned(connections: AvanzaConnectionRepository, user_id: UUID) -> AvanzaConnection:
  connection = await connections.get_for_user(user_id)
  if connection is None:
    raise ResourceNotFound("Avanza isn't connected")
  return connection


@router.get("", summary="Get Avanza Connection", response_model=AvanzaStatusResponse)
async def get_avanza(session: DBSession, current_user: CurrentDBUser) -> AvanzaStatusResponse:
  connection = await AvanzaConnectionRepository.from_session(session).get_for_user(current_user.id)
  return AvanzaStatusResponse(available=available_to(current_user.id), connection=_schema(connection) if connection else None)


@router.post("/connect", summary="Connect Avanza", response_model=AvanzaConnectionSchema, status_code=201)
async def connect_avanza(body: AvanzaConnectRequest, session: DBSession, current_user: CurrentDBUser) -> AvanzaConnectionSchema:
  """Checks the login with Avanza and stores it encrypted; also how new credentials are saved."""
  _require_available(current_user.id)
  connections = AvanzaConnectionRepository.from_session(session)
  try:
    connection = await avanza_service.connect(
      connections, current_user.id, username=body.username.strip(), password=body.password, totp_secret=body.totp_secret
    )
  except AvanzaAuthError as e:
    raise ValidationError(str(e)) from e
  except (AvanzaError, httpx.HTTPError, KeyError, ValueError) as e:
    log.warning("avanza_connect_failed", error=type(e).__name__)
    raise ServiceUnavailableError("Couldn't reach Avanza. Try again in a moment.", status_code=502) from e
  if any(account.bank_account_id for account in connection.accounts):
    avanza_service.request_sync(connection.id)
  return _schema(await _owned(connections, current_user.id))


@router.patch("/accounts/{account_id}", summary="Link Avanza Account", response_model=AvanzaConnectionSchema)
async def link_avanza_account(account_id: UUID, body: AvanzaAccountUpdate, session: DBSession, current_user: CurrentDBUser) -> AvanzaConnectionSchema:
  account = await AvanzaAccountRepository.from_session(session).get_owned(account_id, current_user.id)
  bank_account = None
  if body.bank_account_id is not None:
    bank_account = await BankAccountRepository.from_session(session).get_owned_or_404(
      body.bank_account_id, current_user.id, not_found_message="Bank account not found"
    )
  try:
    await avanza_service.link_account(session, account, bank_account)
  except AvanzaConflictError as e:
    raise ConflictError(str(e)) from e
  await session.flush()
  if bank_account is not None:
    avanza_service.request_sync(account.connection_id)
  connections = AvanzaConnectionRepository.from_session(session)
  connection = await _owned(connections, current_user.id)
  await session.refresh(connection, ["accounts"])
  return _schema(connection)


@router.post("/sync", summary="Sync Avanza", status_code=202)
async def sync_avanza(session: DBSession, current_user: CurrentDBUser) -> None:
  connection = await _owned(AvanzaConnectionRepository.from_session(session), current_user.id)
  if connection.credentials_rejected_at is not None:
    raise ValidationError("Save new Avanza credentials first.")
  if not avanza_service.can_sync_now(connection, now=utc_now()):
    raise TooManyRequestsError("Avanza synced a few minutes ago. Each sync is a full login, so try again shortly.")
  avanza_service.request_sync(connection.id)


@router.delete("", summary="Disconnect Avanza", status_code=204)
async def disconnect_avanza(session: DBSession, current_user: CurrentDBUser) -> None:
  """Deletes the stored login. Imported transactions, trades and positions stay."""
  connections = AvanzaConnectionRepository.from_session(session)
  await connections.delete(await _owned(connections, current_user.id))
