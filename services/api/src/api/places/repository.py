from collections.abc import Sequence
from uuid import UUID

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.place import Place
from sqlalchemy import or_


class PlaceRepository(RepositoryBase[Place], RepositoryIDMixin[Place, UUID]):
  model = Place

  async def search(self, user_id: UUID, query: str, *, limit: int) -> Sequence[Place]:
    statement = (
      self.get_base_statement()
      .where(
        Place.user_id == user_id,
        Place.deleted_at.is_(None),
        or_(Place.name.icontains(query, autoescape=True), Place.address.icontains(query, autoescape=True)),
      )
      .order_by(Place.name)
      .limit(limit)
    )
    return await self.get_all(statement)
