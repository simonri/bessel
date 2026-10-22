from datetime import date

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema
from api.investments.kinds import InvestmentKind, investment_kind
from api.models.transaction import TransactionDirection
from pydantic import UUID4, Field, computed_field


class TransactionSchema(IDSchema, TimestampedSchema):
  amount: int = Field(description="Amount in minor units (cents).")
  currency: str
  transaction_date: date
  direction: TransactionDirection
  description: str | None
  category_id: UUID4 | None
  transaction_type: str | None
  logo_url: str | None = Field(default=None, description="The merchant's logo, when the source provides it.")
  dedup_hash: str
  bank_account_id: UUID4
  raw_id: UUID4 | None
  is_business: bool = Field(default=False, description="Whether this is a business transaction.")
  transfer_id: UUID4 | None = Field(
    default=None, description="Shared with the other side of a move between the user's own accounts; such pairs count as neither income nor spending."
  )

  @computed_field(description="For a broker's movement, what it is, such as a buy or a tax.")  # type: ignore[prop-decorator]
  @property
  def investment_kind(self) -> InvestmentKind | None:
    return investment_kind(self.transaction_type, self.description)


class TransactionUpdate(Schema):
  category_id: UUID4 | None = Field(default=None, description="Category ID to assign.")
  is_business: bool | None = Field(default=None, description="Mark as a business transaction.")


class TransactionUpdateResponse(TransactionSchema):
  same_description_count: int = Field(default=0, description="Number of other transactions with the same description not yet assigned this category.")


class TransactionListResponse(ListResource[TransactionSchema]):
  pass


class ImportResponse(Schema):
  created: int = Field(description="Number of new transactions imported.")
  skipped: int = Field(description="Number of duplicate transactions skipped.")


class BulkDeleteRequest(Schema):
  ids: list[UUID4] = Field(description="List of transaction IDs to delete.")


class BulkCategorizeRequest(Schema):
  description: str = Field(description="Exact description to match.")
  category_id: UUID4 | None = Field(description="Category ID to assign.")


class BulkCategorizeResponse(Schema):
  updated: int = Field(description="Number of transactions updated.")


class BulkUpdateRequest(Schema):
  ids: list[UUID4] = Field(description="List of transaction IDs to update.")
  category_id: UUID4 | None = Field(default=None, description="Category ID to assign to all.")


class BulkUpdateResponse(Schema):
  updated: int = Field(description="Number of transactions updated.")


class CategorySpending(Schema):
  category_id: UUID4 = Field(description="Category ID.")
  category_name: str = Field(description="Category name.")
  category_color: str = Field(description="Category hex color.")
  total: int = Field(description="Total spending in minor units (cents).")


class MonthlySpendingResponse(Schema):
  year: int
  month: int
  items: list[CategorySpending] = Field(description="Spending per category, sorted descending by total.")


class MonthlyFlow(Schema):
  year: int
  month: int
  income: int = Field(description="Total credit amount in minor units.")
  expenses: int = Field(description="Total debit amount in minor units.")


class SummaryMonth(Schema):
  year: int
  month: int
  income: int = Field(description="Money in, in minor units: credits that aren't refunds.")
  spending: int = Field(description="Money out, in minor units: debits less refunds.")


class SummaryCategory(Schema):
  category_id: UUID4 | None = Field(description="Null for spending without a category.")
  name: str
  color: str
  total: int = Field(description="Spending less refunds, in minor units.")
  count: int


class SummaryMerchant(Schema):
  description: str
  total: int = Field(description="Spending less refunds, in minor units.")
  count: int


class CurrencySummary(Schema):
  currency: str
  income: int
  spending: int
  net: int = Field(description="Income minus spending.")
  previous: SummaryMonth = Field(description="The month before.")
  average_income: int = Field(description="Average income over the six months before this one.")
  average_spending: int = Field(description="Average spending over the six months before this one.")
  months: list[SummaryMonth] = Field(description="The twelve months up to and including this one, oldest first.")
  categories: list[SummaryCategory] = Field(description="This month's spending per category, largest first.")
  merchants: list[SummaryMerchant] = Field(description="This month's biggest spending by description, largest first.")


class TransactionSummaryResponse(Schema):
  year: int
  month: int
  currencies: list[CurrencySummary] = Field(description="One summary per currency, never added together; most spending first.")
  uncategorized: int = Field(description="This month's counted transactions without a category.")
  transfers: int = Field(description="This month's transactions left out as moves between the user's own accounts.")


class MonthlyFlowResponse(Schema):
  items: list[MonthlyFlow] = Field(description="Monthly income/expenses, ordered chronologically.")
