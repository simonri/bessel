from pydantic import Field

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema


class CategorySchema(IDSchema, TimestampedSchema):
  name: str = Field(description="Category name.")
  color: str = Field(description="Hex color code for UI display.")


class CategoryCreate(Schema):
  name: str = Field(description="Category name.", max_length=100)
  color: str = Field(default="#6B7280", description="Hex color code.", max_length=7)


class CategoryUpdate(Schema):
  name: str | None = Field(default=None, description="Category name.", max_length=100)
  color: str | None = Field(default=None, description="Hex color code.", max_length=7)


class CategoryListResponse(ListResource[CategorySchema]):
  pass
