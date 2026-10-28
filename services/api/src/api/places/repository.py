from collections.abc import Collection, Sequence
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

  async def list_saved(self, user_id: UUID, *, status: str | None, query: str | None, limit: int) -> Sequence[Place]:
    statement = self.get_base_statement().where(Place.user_id == user_id, Place.deleted_at.is_(None))
    if status is not None:
      statement = statement.where(Place.status == status)
    if query:
      statement = statement.where(
        or_(
          Place.name.icontains(query, autoescape=True),
          Place.address.icontains(query, autoescape=True),
          Place.country.icontains(query, autoescape=True),
          Place.category.icontains(query, autoescape=True),
        )
      )
    return await self.get_all(statement.order_by(Place.name).limit(limit))

  async def by_google_place_ids(self, user_id: UUID, place_ids: Collection[str]) -> dict[str, Place]:
    if not place_ids:
      return {}
    statement = self.get_base_statement().where(Place.user_id == user_id, Place.deleted_at.is_(None), Place.google_place_id.in_(place_ids))
    return {place.google_place_id: place for place in await self.get_all(statement) if place.google_place_id}
