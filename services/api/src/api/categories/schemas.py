from pydantic import UUID4, Field

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, TimestampedSchema


class CategorySchema(IDSchema, TimestampedSchema):
  name: str = Field(description="Category name.")
  slug: str = Field(description="URL-friendly identifier.")
  color: str = Field(description="Hex color code for UI display.")
  excluded: bool = Field(description="Whether this category is excluded from reports.")
  parent_id: UUID4 | None = Field(default=None, description="Parent category ID, null for top-level.")


class CategoryListResponse(ListResource[CategorySchema]):
  pass
