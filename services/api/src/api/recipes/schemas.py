from typing import Any

from pydantic import Field, model_validator

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema
from api.models.recipe import Recipe, RecipeType
from api.recipes.body import RecipeBody, parse_markdown


class RecipeSchema(IDSchema, TimestampedSchema):
  title: str
  content: str
  recipe_type: RecipeType
  body: RecipeBody
  structured: bool = Field(description="False when `body` was derived from markdown on the fly rather than saved.")

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
