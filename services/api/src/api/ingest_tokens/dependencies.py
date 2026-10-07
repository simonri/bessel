from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header

from api.common.utils import utc_now
from api.exceptions import UnauthorizedError
from api.ingest_tokens.repository import IngestTokenRepository
from api.ingest_tokens.service import hash_token
from api.postgres import DBSession


async def get_ingest_user_id(
  session: DBSession,
  x_api_key: Annotated[str | None, Header()] = None,
) -> UUID:
  """Resolve the owner of the ingest token a local daemon sends in X-Api-Key."""
  if not x_api_key:
    raise UnauthorizedError("Missing API key")
  repo = IngestTokenRepository.from_session(session)
  token = await repo.get_active_by_hash(hash_token(x_api_key))
  if token is None:
    raise UnauthorizedError("Invalid API key")
  await repo.update(token, update_dict={"last_used_at": utc_now()})
  return token.user_id


IngestUserId = Annotated[UUID, Depends(get_ingest_user_id)]
