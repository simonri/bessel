from uuid import UUID

from api.common.repository.base import RepositoryBase, RepositoryIDMixin, RepositoryUserMixin
from api.models.category import Category


class CategoryRepository(RepositoryBase[Category], RepositoryIDMixin[Category, UUID], RepositoryUserMixin[Category]):
  model = Category
