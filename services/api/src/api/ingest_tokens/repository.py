from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select, update

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.common.utils import utc_now
from api.models.ingest_token import IngestToken


class IngestTokenRepository(RepositoryBase[IngestToken], RepositoryIDMixin[IngestToken, UUID]):
  model = IngestToken

  async def get_active_by_hash(self, token_hash: str) -> IngestToken | None:
    statement = select(IngestToken).where(IngestToken.token_hash == token_hash).where(IngestToken.deleted_at.is_(None))
    return await self.get_one_or_none(statement)

  async def list_active_for_user(self, user_id: UUID) -> Sequence[IngestToken]:
    statement = select(IngestToken).where(IngestToken.user_id == user_id).where(IngestToken.deleted_at.is_(None)).order_by(IngestToken.created_at.desc())
    return await self.get_all(statement)

  async def revoke_by_name(self, user_id: UUID, name: str) -> None:
    statement = (
      update(IngestToken)
      .where(IngestToken.user_id == user_id)
      .where(IngestToken.name == name)
      .where(IngestToken.deleted_at.is_(None))
      .values(deleted_at=utc_now())
    )
    await self.session.execute(statement)
