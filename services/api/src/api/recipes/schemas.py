from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema
from api.models.recipe import RecipeType


class RecipeSchema(IDSchema, TimestampedSchema):
  title: str
  content: str
  recipe_type: RecipeType


class RecipeCreate(Schema):
  title: str
  content: str = ""
  recipe_type: RecipeType = RecipeType.other


class RecipeUpdate(Schema):
  title: str | None = None
  content: str | None = None
  recipe_type: RecipeType | None = None


class RecipeListResponse(ListResource[RecipeSchema]):
  pass
