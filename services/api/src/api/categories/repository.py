from uuid import UUID

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.category import Category


class CategoryRepository(RepositoryBase[Category], RepositoryIDMixin[Category, UUID]):
  model = Category
