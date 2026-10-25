from datetime import date
from typing import Any, Self

from pydantic import Field, model_validator

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema
from api.models.recipe import Recipe, RecipeType
from api.recipes.body import RecipeBody, parse_markdown
from api.recipes.repository import CookStats


class RecipeSchema(IDSchema, TimestampedSchema):
  title: str
  content: str
  recipe_type: RecipeType
  body: RecipeBody
  structured: bool = Field(description="False when `body` was derived from markdown on the fly rather than saved.")
  last_cooked_on: date | None = Field(default=None, description="The latest day it was cooked, in the user's own time zone.")
  cook_count: int = Field(default=0, description="How many days it has been cooked.")

  @classmethod
  def from_recipe(cls, recipe: Recipe, cooks: CookStats) -> Self:
    return cls.model_validate(recipe).model_copy(update={"last_cooked_on": cooks.last_cooked_on, "cook_count": cooks.cook_count})

  @model_validator(mode="before")
  @classmethod
  def _read_legacy_markdown(cls, data: Any) -> Any:
    if isinstance(data, Recipe):
      return {
        "id": data.id,
        "created_at": data.created_at,
        "modified_at": data.modified_at,
        "title": data.title,
        "content": data.content,
        "recipe_type": data.recipe_type,
        # Recipes saved before structured bodies existed only have markdown.
        "body": data.body if data.body is not None else parse_markdown(data.content),
        "structured": data.body is not None,
      }
    return data


class RecipeCreate(Schema):
  title: str
  content: str = ""
  recipe_type: RecipeType = RecipeType.other
  body: RecipeBody | None = None


class RecipeUpdate(Schema):
  title: str | None = None
  content: str | None = None
  recipe_type: RecipeType | None = None
  body: RecipeBody | None = None


class RecipeImportRequest(Schema):
  text: str = Field(description="Recipe text in any form: markdown, notes, or a copied web page.")


class RecipeImportResult(Schema):
  title: str
  recipe_type: RecipeType
  body: RecipeBody


class RecipeListResponse(ListResource[RecipeSchema]):
  pass


class RecipeCookResult(Schema):
  recipe: RecipeSchema
  created: bool = Field(description="False when the day was already logged, so there's nothing for this request to undo.")


class RecipeCookHistory(Schema):
  days: list[date] = Field(description="Every day the recipe was cooked, latest first.")
