from uuid import UUID

from fastapi import APIRouter

from api.avanza.repository import AvanzaAccountRepository, AvanzaConnectionRepository
from api.avanza.schemas import AvanzaAccountUpdate, AvanzaConnectionSchema, AvanzaImportRequest, AvanzaStatusResponse, AvanzaSyncFailure
from api.avanza.service import AvanzaConflictError, AvanzaDataError, available_to, avanza_service, parse
from api.bank_accounts.repository import BankAccountRepository
from api.exceptions import ConflictError, ForbiddenError, ResourceNotFound, ValidationError
from api.models.avanza import AvanzaConnection
from api.postgres import DBSession
from api.users.dependencies import CurrentDBUser

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
      "sync_from": avanza_service.sync_from(connection),
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


@router.post("/import", summary="Import Avanza Data", response_model=AvanzaConnectionSchema)
async def import_avanza(body: AvanzaImportRequest, session: DBSession, current_user: CurrentDBUser) -> AvanzaConnectionSchema:
  """Imports Avanza's responses as the desktop app read them; connects Avanza on the first import."""
  _require_available(current_user.id)
  try:
    fetched = parse(body.overview, body.positions, body.transactions)
  except AvanzaDataError as e:
    raise ValidationError("Avanza's data wasn't in the expected shape.", status_code=422) from e
  connection = await avanza_service.import_data(
    AvanzaConnectionRepository.from_session(session),
    current_user.id,
    username=body.username.strip(),
    fetched=fetched,
    fetched_from=body.fetched_from,
  )
  return _schema(connection)


@router.post("/sync-failed", summary="Report Avanza Sync Failure", status_code=204)
async def report_avanza_sync_failed(body: AvanzaSyncFailure, session: DBSession, current_user: CurrentDBUser) -> None:
  connection = await _owned(AvanzaConnectionRepository.from_session(session), current_user.id)
  avanza_service.report_failure(connection, body.reason)
  await session.flush()


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
  connection = await _owned(AvanzaConnectionRepository.from_session(session), current_user.id)
  await session.refresh(connection, ["accounts"])
  return _schema(connection)


@router.delete("", summary="Disconnect Avanza", status_code=204)
async def disconnect_avanza(session: DBSession, current_user: CurrentDBUser) -> None:
  """Forgets the connection and its account links; no Avanza login is stored. Imported transactions, trades and positions stay."""
  connections = AvanzaConnectionRepository.from_session(session)
  await connections.delete(await _owned(connections, current_user.id))
