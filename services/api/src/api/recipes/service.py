from datetime import date, timedelta
from typing import Any

from api.common.utils import utc_now
from api.exceptions import ResourceNotFound, ValidationError
from api.models.recipe import Recipe, RecipeType
from api.models.user import User
from api.postgres import AsyncSession
from api.recipes.body import RecipeBody, render_markdown
from api.recipes.repository import RecipeCookRepository, RecipeRepository


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

  async def log_cook(self, cooks: RecipeCookRepository, recipe: Recipe, cooked_on: date) -> bool:
    """Logs the day the app says it is where the user is; True when this call added it."""
    # A day past tomorrow in UTC is a day no time zone has reached yet.
    if cooked_on > utc_now().date() + timedelta(days=1):
      raise ValidationError("That day hasn't happened yet.")
    created = await cooks.add(recipe, cooked_on)
    await cooks.session.flush()
    return created

  async def remove_cook(self, cooks: RecipeCookRepository, recipe: Recipe, cooked_on: date) -> None:
    cook = await cooks.get_for_day(recipe, cooked_on)
    if cook is None:
      raise ResourceNotFound("Not logged as cooked that day.")
    await cooks.delete(cook, flush=True)


recipe_service = RecipeService()
