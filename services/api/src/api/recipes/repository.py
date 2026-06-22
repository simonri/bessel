from uuid import UUID

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.recipe import Recipe


class RecipeRepository(RepositoryBase[Recipe], RepositoryIDMixin[Recipe, UUID]):
  model = Recipe
