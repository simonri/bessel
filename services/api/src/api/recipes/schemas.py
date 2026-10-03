from typing import Any

from pydantic import model_validator

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema
from api.models.recipe import Recipe, RecipeType
from api.recipes.body import RecipeBody, parse_markdown


class RecipeSchema(IDSchema, TimestampedSchema):
  title: str
  content: str
  recipe_type: RecipeType
  body: RecipeBody

  @model_validator(mode="before")
  @classmethod
  def _read_legacy_markdown(cls, data: Any) -> Any:
    # Recipes saved before structured bodies existed only have markdown.
    if isinstance(data, Recipe) and data.body is None:
      return {
        "id": data.id,
        "created_at": data.created_at,
        "modified_at": data.modified_at,
        "title": data.title,
        "content": data.content,
        "recipe_type": data.recipe_type,
        "body": parse_markdown(data.content),
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


class RecipeListResponse(ListResource[RecipeSchema]):
  pass
