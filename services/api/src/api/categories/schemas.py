from pydantic import UUID4, Field

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema
from api.models.category_rule import RuleScope
from api.models.transaction import TransactionDirection


class CategorySchema(IDSchema, TimestampedSchema):
  name: str = Field(description="Category name.")
  slug: str = Field(description="URL-friendly identifier.")
  color: str = Field(description="Hex color code for UI display.")
  excluded: bool = Field(description="Whether this category is excluded from reports.")
  parent_id: UUID4 | None = Field(default=None, description="Parent category ID, null for top-level.")


class CategoryListResponse(ListResource[CategorySchema]):
  pass


class CategoryRuleSchema(IDSchema, TimestampedSchema):
  category_id: UUID4
  pattern: str = Field(description="Text matched case-insensitively anywhere in the description.")
  scope: RuleScope = Field(description="Which accounts it looks at: any, private or company.")
  direction: TransactionDirection | None = Field(description="Only money in (credit) or out (debit), or both when null.")
  mark_business: bool = Field(description="Also mark matching transactions as business expenses.")


class CategoryRuleCreate(Schema):
  category_id: UUID4
  pattern: str = Field(min_length=2, max_length=255)
  scope: RuleScope = RuleScope.any
  direction: TransactionDirection | None = None
  mark_business: bool = False
  apply_now: bool = Field(default=True, description="Also sort the uncategorized transactions already imported.")


class CategoryRuleCreated(CategoryRuleSchema):
  categorized: int = Field(description="Transactions already imported that the rules sorted.")


class CategoryRuleListResponse(Schema):
  items: list[CategoryRuleSchema]
