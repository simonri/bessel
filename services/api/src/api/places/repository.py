from uuid import UUID

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.place import Place


class PlaceRepository(RepositoryBase[Place], RepositoryIDMixin[Place, UUID]):
  model = Place
