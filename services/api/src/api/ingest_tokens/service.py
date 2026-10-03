import hashlib
import secrets
from uuid import UUID

from api.ingest_tokens.repository import IngestTokenRepository
from api.models.ingest_token import IngestToken

TOKEN_PREFIX = "bsl_"


def hash_token(token: str) -> str:
  return hashlib.sha256(token.encode()).hexdigest()


class IngestTokenService:
  async def create(self, repo: IngestTokenRepository, user_id: UUID, name: str) -> tuple[IngestToken, str]:
    await repo.revoke_by_name(user_id, name)
    token = TOKEN_PREFIX + secrets.token_urlsafe(32)
    record = await repo.create(IngestToken(user_id=user_id, name=name, token_hash=hash_token(token)), flush=True)
    return record, token


ingest_token_service = IngestTokenService()
