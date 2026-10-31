from typing import Annotated, Literal
from uuid import UUID

from mcp.server.mcpserver import Context
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field, ValidationError
from sqlalchemy import func

from api.common.schemas import Schema
from api.mcp.context import user_session
from api.mcp.tools.common import ToolSpec, read, write
from api.models.recipe import Recipe, RecipeType
from api.recipes.body import RecipeBody, RecipeIngredient, RecipeSection, RecipeStep, parse_ingredient_line
from api.recipes.repository import CookStats, RecipeCookRepository, RecipeRepository
from api.recipes.schemas import RecipeSchema
from api.recipes.service import content_fields, recipe_service

ClearableField = Literal["intro", "yield_text", "total_minutes", "active_minutes", "sections"]


class RecipeSummary(Schema):
  id: UUID
  title: str
  recipe_type: RecipeType


class Recipes(Schema):
  total_count: int
  recipes: list[RecipeSummary] = Field(description="Alphabetical by title.")


class IngredientGroupInput(Schema):
  title: str | None = Field(default=None, max_length=200, description="e.g. 'Dressing'; omit for a recipe with a single list.")
  lines: list[str] = Field(description="One ingredient per line as written in the recipe, e.g. '2 dl milk, warm' or '1 onion (finely chopped)'.")


class AddedRecipe(Schema):
  id: UUID
  title: str
  ingredient_count: int = Field(description="Ingredient lines saved across all groups.")


class UpdatedRecipe(Schema):
  id: UUID
  title: str
  changed: list[str] = Field(description="The fields that now differ from before.")


def _first_error(error: ValidationError) -> str:
  detail = error.errors()[0]
  location = ".".join(str(part) for part in detail["loc"])
  return f"{location}: {detail['msg']}" if location else detail["msg"]


def _ingredient(line: str) -> RecipeIngredient:
  try:
    return parse_ingredient_line(line)
  except ValidationError as e:
    raise ToolError(f"Couldn't read the ingredient line {line[:80]!r} ({_first_error(e)}). Shorten it or move details into the step text.") from e


def _groups(ingredient_groups: list[IngredientGroupInput]) -> list[dict]:
  return [{"title": group.title, "items": [_ingredient(line) for line in group.lines if line.strip()]} for group in ingredient_groups]


def _body(fields: dict) -> RecipeBody:
  try:
    return RecipeBody.model_validate(fields)
  except ValidationError as e:
    raise ToolError(f"The recipe isn't valid: {_first_error(e)}.") from e


async def search_recipes(
  ctx: Context,
  search: Annotated[str | None, Field(description="Case-insensitive text to look for in the title.")] = None,
  ingredients: Annotated[
    list[str] | None,
    Field(
      description=(
        "Only recipes that use every one of these, e.g. ['leek', 'feta']. Each is matched case-insensitively as part of an ingredient name, "
        + "so a stem like 'leek' also finds 'leeks'. Write them in the language the recipes use."
      )
    ),
  ] = None,
  limit: Annotated[int, Field(ge=1, le=200)] = 50,
) -> Recipes:
  """The user's saved recipes, optionally narrowed by title or by ingredients.

  Use `ingredients` for "what can I cook with leeks and feta?" or to use up what's in the fridge. Follow up with get_recipe for the full recipe.
  """
  wanted = [word.strip() for word in ingredients or [] if word.strip()]
  async with user_session(ctx) as (session, user):
    repo = RecipeRepository.from_session(session)
    statement = repo.get_filtered_statement(user.id, search=search, ingredients=wanted).order_by(func.lower(Recipe.title), Recipe.id)
    rows, total_count = await repo.paginate(statement, limit=limit, page=1)
  return Recipes(total_count=total_count, recipes=[RecipeSummary(id=r.id, title=r.title, recipe_type=RecipeType(r.recipe_type)) for r in rows])


async def get_recipe(ctx: Context, recipe_id: UUID) -> RecipeSchema:
  """One recipe with its ingredients and steps."""
  async with user_session(ctx) as (session, user):
    recipe = await RecipeRepository.from_session(session).get_owned_or_404(recipe_id, user.id, not_found_message="Recipe not found.")
    stats = await RecipeCookRepository.from_session(session).stats([recipe.id])
    return RecipeSchema.from_recipe(recipe, stats.get(recipe.id, CookStats()))


async def add_recipe(
  ctx: Context,
  title: Annotated[str, Field(min_length=1, max_length=500)],
  recipe_type: Annotated[RecipeType, Field(description="'main' for a meal, 'dessert' for sweets and baking, otherwise 'other'.")],
  ingredient_groups: Annotated[list[IngredientGroupInput], Field(description="Usually one untitled group; split only where the recipe does.")],
  steps: Annotated[list[RecipeStep], Field(description="In order. Give `title` and `time_label` only when the recipe has them.")],
  intro: Annotated[str | None, Field(description="A short description from the recipe, if it has one.")] = None,
  yield_text: Annotated[str | None, Field(description="e.g. '4 servings' or '12 buns'.")] = None,
  total_minutes: Annotated[int | None, Field(description="Total time, including waiting.")] = None,
  active_minutes: Annotated[int | None, Field(description="Hands-on time.")] = None,
  sections: Annotated[list[RecipeSection] | None, Field(description="Anything else worth keeping, e.g. 'Serving' or 'Storage'.")] = None,
) -> AddedRecipe:
  """Save a recipe to the user's collection, from text they pasted or a page you read.

  Copy amounts, units and wording from the source rather than rewriting them; ingredient lines are parsed into amount, unit and name on save.
  Search first if it might already be saved: a recipe with the same title is refused, and nothing is ever overwritten.
  """
  title = title.strip()
  if not title:
    raise ToolError("The title can't be blank.")
  body = _body(
    {
      "intro": intro,
      "yield_text": yield_text,
      "total_minutes": total_minutes,
      "active_minutes": active_minutes,
      "ingredient_groups": _groups(ingredient_groups),
      "steps": steps,
      "sections": sections or [],
    }
  )

  async with user_session(ctx) as (session, user):
    existing = await RecipeRepository.from_session(session).get_by_title(user.id, title)
    if existing is not None:
      raise ToolError(
        f"A recipe called {existing.title!r} is already saved (id {existing.id}). "
        + "Check it with get_recipe; if this is a different recipe, save it under a more specific title, e.g. with its source or variation."
      )
    recipe = await recipe_service.create(session, user, title=title, recipe_type=recipe_type, body=body)
    return AddedRecipe(id=recipe.id, title=recipe.title, ingredient_count=sum(len(group.items) for group in body.ingredient_groups))


async def update_recipe(
  ctx: Context,
  recipe_id: UUID,
  title: Annotated[str | None, Field(min_length=1, max_length=500)] = None,
  recipe_type: RecipeType | None = None,
  intro: str | None = None,
  yield_text: str | None = None,
  total_minutes: int | None = None,
  active_minutes: int | None = None,
  ingredient_groups: Annotated[
    list[IngredientGroupInput] | None, Field(description="Replaces all ingredients; give every group and line, as in add_recipe.")
  ] = None,
  steps: Annotated[list[RecipeStep] | None, Field(description="Replaces all steps; give every step in order.")] = None,
  sections: Annotated[list[RecipeSection] | None, Field(description="Replaces all extra sections.")] = None,
  clear: Annotated[list[ClearableField] | None, Field(description="Fields to empty, e.g. ['active_minutes'] when the recipe doesn't say.")] = None,
) -> UpdatedRecipe:
  """Change a saved recipe: fix an amount, rewrite a step, scale it, add a tip, retitle or recategorise it.

  Give only what changes; everything else stays as it is. Ingredients, steps and sections are each replaced as a
  whole list, so call get_recipe first and send the full list with your change in it. Nothing is ever deleted.
  """
  if title is not None and not title.strip():
    raise ToolError("The title can't be blank.")
  given = {"intro": intro, "yield_text": yield_text, "total_minutes": total_minutes, "active_minutes": active_minutes, "steps": steps, "sections": sections}
  cleared = set(clear or [])
  if conflicting := sorted(name for name in cleared if given[name] is not None):
    raise ToolError(f"{', '.join(conflicting)} can't be both set and cleared.")
  new_groups = _groups(ingredient_groups) if ingredient_groups is not None else None

  async with user_session(ctx) as (session, user):
    repository = RecipeRepository.from_session(session)
    recipe = await repository.get_owned_or_404(recipe_id, user.id, not_found_message="Recipe not found.")
    before = RecipeSchema.model_validate(recipe)
    fields = before.body.model_dump(mode="json")
    fields |= {name: value for name, value in given.items() if value is not None}
    if new_groups is not None:
      fields["ingredient_groups"] = new_groups
    fields |= {name: ([] if name == "sections" else None) for name in cleared}
    body = _body(fields)

    update: dict = {}
    new_title = title.strip() if title is not None else before.title
    if new_title != before.title:
      clash = await repository.get_by_title(user.id, new_title)
      if clash is not None and clash.id != recipe.id:
        raise ToolError(f"Another recipe is already called {clash.title!r} (id {clash.id}). Pick a more specific title.")
      update["title"] = new_title
    if recipe_type is not None and recipe_type != before.recipe_type:
      update["recipe_type"] = recipe_type
    old = before.body.model_dump(mode="json")
    changed = sorted([*update, *(name for name, value in body.model_dump(mode="json").items() if value != old[name])])
    if body != before.body or not before.structured:
      update |= content_fields("", body)
    if update:
      recipe = await repository.update(recipe, update_dict=update)
    return UpdatedRecipe(id=recipe.id, title=recipe.title, changed=changed)


TOOLS: list[ToolSpec] = [
  read(search_recipes, "Search recipes"),
  read(get_recipe, "Get recipe"),
  write(add_recipe, "Add recipe"),
  write(update_recipe, "Update recipe", idempotent=True, overwrites=True),
]
