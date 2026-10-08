from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import Select, Text, cast, func, or_
from sqlalchemy.dialects.postgresql import JSONPATH

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.recipe import Recipe

_INGREDIENT_NAMES_PATH = "$.ingredient_groups[*].items[*].name"


class RecipeRepository(RepositoryBase[Recipe], RepositoryIDMixin[Recipe, UUID]):
  model = Recipe

  def get_filtered_statement(self, user_id: UUID, *, search: str | None = None, ingredients: Sequence[str] = ()) -> Select[tuple[Recipe]]:
    """Every ingredient must match an ingredient name of a structured recipe, or the content of a markdown-only one."""
    statement = self.get_base_statement().where(Recipe.user_id == user_id)
    if search:
      statement = statement.where(Recipe.title.icontains(search, autoescape=True))
    ingredient_names = cast(func.jsonb_path_query_array(Recipe.body, cast(_INGREDIENT_NAMES_PATH, JSONPATH)), Text)
    for ingredient in ingredients:
      statement = statement.where(
        or_(
          Recipe.body.is_not(None) & ingredient_names.icontains(ingredient, autoescape=True),
          Recipe.body.is_(None) & Recipe.content.icontains(ingredient, autoescape=True),
        )
      )
    return statement

  async def get_by_title(self, user_id: UUID, title: str) -> Recipe | None:
    """The user's oldest recipe with this title, ignoring case."""
    statement = self.get_base_statement().where(Recipe.user_id == user_id, func.lower(Recipe.title) == func.lower(title)).order_by(Recipe.created_at).limit(1)
    return await self.get_one_or_none(statement)
