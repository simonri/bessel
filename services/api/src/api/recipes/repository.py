from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from uuid import UUID

from sqlalchemy import Select, Text, cast, func, or_, select
from sqlalchemy.dialects.postgresql import JSONPATH
from sqlalchemy.dialects.postgresql import insert as pg_insert

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.recipe import Recipe, RecipeCook

_INGREDIENT_NAMES_PATH = "$.ingredient_groups[*].items[*].name"


class RecipeRepository(RepositoryBase[Recipe], RepositoryIDMixin[Recipe, UUID]):
  model = Recipe

  def get_filtered_statement(self, user_id: UUID, *, search: str | None = None, ingredients: Sequence[str] = ()) -> Select[Recipe]:
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

  async def search(self, user_id: UUID, query: str, *, limit: int) -> Sequence[Recipe]:
    statement = self.get_filtered_statement(user_id, search=query).where(Recipe.deleted_at.is_(None)).order_by(Recipe.title).limit(limit)
    return await self.get_all(statement)


@dataclass(frozen=True, slots=True)
class CookStats:
  last_cooked_on: date | None = None
  cook_count: int = 0


class RecipeCookRepository(RepositoryBase[RecipeCook], RepositoryIDMixin[RecipeCook, UUID]):
  model = RecipeCook

  async def add(self, recipe: Recipe, cooked_on: date) -> bool:
    """Logs the day; False when it was already logged."""
    statement = (
      pg_insert(RecipeCook)
      .values(user_id=recipe.user_id, recipe_id=recipe.id, cooked_on=cooked_on)
      .on_conflict_do_nothing(constraint="recipe_cooks_recipe_id_cooked_on_key")
      .returning(RecipeCook.id)
    )
    return (await self.session.execute(statement)).scalar_one_or_none() is not None

  async def get_for_day(self, recipe: Recipe, cooked_on: date) -> RecipeCook | None:
    statement = self.get_base_statement().where(RecipeCook.recipe_id == recipe.id, RecipeCook.cooked_on == cooked_on)
    return await self.get_one_or_none(statement)

  async def days(self, recipe: Recipe) -> Sequence[date]:
    """Every day the recipe was cooked, latest first."""
    statement = select(RecipeCook.cooked_on).where(RecipeCook.recipe_id == recipe.id).order_by(RecipeCook.cooked_on.desc())
    return (await self.session.execute(statement)).scalars().all()

  async def stats(self, recipe_ids: Sequence[UUID]) -> dict[UUID, CookStats]:
    """When each recipe was last cooked and how often; recipes never cooked are left out."""
    if not recipe_ids:
      return {}
    statement = (
      select(RecipeCook.recipe_id, func.max(RecipeCook.cooked_on), func.count()).where(RecipeCook.recipe_id.in_(recipe_ids)).group_by(RecipeCook.recipe_id)
    )
    return {recipe_id: CookStats(last, count) for recipe_id, last, count in (await self.session.execute(statement)).all()}
