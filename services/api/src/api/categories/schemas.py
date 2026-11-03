from datetime import date
from typing import Annotated

from pydantic import UUID4, Field

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema
from api.models.category_rule import RuleScope
from api.models.transaction import TransactionDirection

Color = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$", description="Hex color code for UI display.")]
CategoryName = Annotated[str, Field(min_length=1, max_length=100)]
Pattern = Annotated[str, Field(min_length=2, max_length=255, description="Text matched case-insensitively anywhere in the description.")]


class CategorySchema(IDSchema, TimestampedSchema):
  name: str = Field(description="Category name.")
  slug: str = Field(description="URL-friendly identifier.")
  color: str = Field(description="Hex color code for UI display.")
  excluded: bool = Field(description="Whether this category is excluded from reports.")
  income: bool = Field(description="Whether money in under it counts as income; elsewhere it's money back that lowers spending.")
  parent_id: UUID4 | None = Field(default=None, description="Parent category ID, null for top-level.")
  transaction_count: int = Field(default=0, description="Transactions filed under it.")
  rule_count: int = Field(default=0, description="Rules that sort transactions into it.")


class CategoryListResponse(ListResource[CategorySchema]):
  pass


class CategoryCreate(Schema):
  name: CategoryName
  color: Color = "#6B7280"
  parent_id: UUID4 | None = Field(default=None, description="The group it goes in; a new group when null.")
  excluded: bool | None = Field(default=None, description="Kept out of reports; by default like its group.")
  income: bool = False


class CategoryUpdate(Schema):
  name: CategoryName | None = None
  color: Color | None = None
  parent_id: UUID4 | None = Field(default=None, description="Moves a category to another group. Groups stay groups.")
  excluded: bool | None = None
  income: bool | None = None


class CategoryRuleSchema(IDSchema, TimestampedSchema):
  category_id: UUID4
  pattern: str = Field(description="Text matched case-insensitively anywhere in the description.")
  scope: RuleScope = Field(description="Which accounts it looks at: any, private or company.")
  direction: TransactionDirection | None = Field(description="Only money in (credit) or out (debit), or both when null.")
  mark_business: bool = Field(description="Also mark matching transactions as business expenses.")
  transaction_count: int = Field(default=0, description="Transactions it has sorted that still have the category it gave.")


class CategoryRuleCreate(Schema):
  category_id: UUID4
  pattern: Pattern
  scope: RuleScope = RuleScope.any
  direction: TransactionDirection | None = None
  mark_business: bool = False
  apply_now: bool = Field(default=True, description="Also sort the uncategorized transactions already imported.")


class CategoryRuleUpdate(Schema):
  category_id: UUID4 | None = None
  pattern: Pattern | None = None
  scope: RuleScope | None = None
  direction: TransactionDirection | None = Field(default=None, description="Null matches both directions.")
  mark_business: bool | None = None
  apply_now: bool = Field(default=False, description="Also sort the uncategorized transactions already imported.")


class CategoryRuleCreated(CategoryRuleSchema):
  categorized: int = Field(description="Transactions already imported that the rule sorted.")


class CategoryRuleListResponse(Schema):
  items: list[CategoryRuleSchema]


class CategoryRulePreviewRequest(Schema):
  pattern: Pattern
  scope: RuleScope = RuleScope.any
  direction: TransactionDirection | None = None
  rule_id: UUID4 | None = Field(default=None, description="The rule being edited, previewed as these settings in its place.")


class CategoryRuleMatch(Schema):
  id: UUID4
  transaction_date: date
  description: str | None
  name: str | None
  amount: int = Field(description="Amount in minor units (cents).")
  currency: str
  direction: TransactionDirection
  category_id: UUID4 | None = Field(description="The category it has now.")
  by_rule: bool = Field(description="Its category came from a rule rather than the user.")
  would_sort: bool = Field(
    description="The rule would give it its category: uncategorized, or sorted by the rule being edited, and no more specific rule wins."
  )


class CategoryRulePreview(Schema):
  match_count: int = Field(description="Existing transactions the rule matches, categorized or not.")
  sortable_count: int = Field(description="Uncategorized ones it would sort when applied to existing transactions.")
  items: list[CategoryRuleMatch] = Field(description="The newest matches, at most 50.")
