from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema


class RecipeSchema(IDSchema, TimestampedSchema):
  title: str
  content: str


class RecipeCreate(Schema):
  title: str
  content: str = ""


class RecipeUpdate(Schema):
  title: str | None = None
  content: str | None = None


class RecipeListResponse(ListResource[RecipeSchema]):
  pass
