from typing import Any

from api.models.recipe import Recipe, RecipeType
from api.models.user import User
from api.postgres import AsyncSession
from api.recipes.body import RecipeBody, render_markdown
from api.recipes.repository import RecipeRepository


def content_fields(content: str, body: RecipeBody | None) -> dict[str, Any]:
  """A structured body is the source of truth; `content` mirrors it as markdown."""
  if body is None:
    return {"content": content, "body": None}
  return {"content": render_markdown(body), "body": body.model_dump(mode="json")}


class RecipeService:
  async def create(
    self,
    session: AsyncSession,
    user: User,
    *,
    title: str,
    recipe_type: RecipeType,
    content: str = "",
    body: RecipeBody | None = None,
  ) -> Recipe:
    recipe = Recipe(title=title, recipe_type=recipe_type, user_id=user.id, **content_fields(content, body))
    return await RecipeRepository.from_session(session).create(recipe, flush=True)


recipe_service = RecipeService()
