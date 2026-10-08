from uuid import UUID

from fastapi import APIRouter

from api.common.utils import utc_now
from api.ingest_tokens.repository import IngestTokenRepository
from api.ingest_tokens.schemas import IngestTokenCreate, IngestTokenCreated, IngestTokenSchema
from api.ingest_tokens.service import ingest_token_service
from api.postgres import DBSession
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/ingest-tokens", tags=["ingest-tokens"])


@router.post("", summary="Create Ingest Token", response_model=IngestTokenCreated, status_code=201)
async def create_ingest_token(
  body: IngestTokenCreate,
  session: DBSession,
  current_user: CurrentDBUser,
) -> IngestTokenCreated:
  repo = IngestTokenRepository.from_session(session)
  record, token = await ingest_token_service.create(repo, current_user.id, body.name)
  return IngestTokenCreated(**IngestTokenSchema.model_validate(record).model_dump(), token=token)


@router.get("", summary="List Ingest Tokens", response_model=list[IngestTokenSchema])
async def list_ingest_tokens(
  session: DBSession,
  current_user: CurrentDBUser,
) -> list[IngestTokenSchema]:
  repo = IngestTokenRepository.from_session(session)
  return [IngestTokenSchema.model_validate(t) for t in await repo.list_active_for_user(current_user.id)]


@router.delete("/{token_id}", summary="Revoke Ingest Token", status_code=204)
async def revoke_ingest_token(
  token_id: UUID,
  session: DBSession,
  current_user: CurrentDBUser,
) -> None:
  repo = IngestTokenRepository.from_session(session)
  token = await repo.get_owned_or_404(token_id, current_user.id, not_found_message="Token not found")
  await repo.update(token, update_dict={"deleted_at": utc_now()}, flush=True)
