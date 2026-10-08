from typing import Annotated
from uuid import UUID

from mcp.server.mcpserver import Context
from pydantic import Field
from sqlalchemy import func

from api.common.schemas import Schema
from api.mcp.context import user_session
from api.mcp.tools.common import ToolSpec, read
from api.models.recipe import Recipe, RecipeType
from api.recipes.repository import RecipeRepository
from api.recipes.schemas import RecipeSchema


class RecipeSummary(Schema):
  id: UUID
  title: str
  recipe_type: RecipeType


class Recipes(Schema):
  total_count: int
  recipes: list[RecipeSummary] = Field(description="Alphabetical by title.")


async def search_recipes(
  ctx: Context,
  search: Annotated[str | None, Field(description="Case-insensitive text to look for in the title.")] = None,
  limit: Annotated[int, Field(ge=1, le=200)] = 50,
) -> Recipes:
  """The user's saved recipes. Use get_recipe for ingredients and steps."""
  async with user_session(ctx) as (session, user):
    repo = RecipeRepository.from_session(session)
    statement = repo.get_base_statement().where(Recipe.user_id == user.id)
    if search:
      statement = statement.where(Recipe.title.ilike(f"%{search}%"))
    rows, total_count = await repo.paginate(statement.order_by(func.lower(Recipe.title), Recipe.id), limit=limit, page=1)
  return Recipes(total_count=total_count, recipes=[RecipeSummary(id=r.id, title=r.title, recipe_type=r.recipe_type) for r in rows])


async def get_recipe(ctx: Context, recipe_id: UUID) -> RecipeSchema:
  """One recipe with its ingredients and steps."""
  async with user_session(ctx) as (session, user):
    recipe = await RecipeRepository.from_session(session).get_owned_or_404(recipe_id, user.id, not_found_message="Recipe not found.")
    return RecipeSchema.model_validate(recipe)


TOOLS: list[ToolSpec] = [
  read(search_recipes, "Search recipes"),
  read(get_recipe, "Get recipe"),
]
