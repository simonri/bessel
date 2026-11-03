from datetime import date
from typing import Annotated

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema
from api.investments.kinds import InvestmentKind, investment_kind
from api.models.transaction import TransactionDirection
from pydantic import UUID4, AfterValidator, BeforeValidator, Field, StringConstraints, computed_field


def _blank_as_none(value: object) -> object:
  if isinstance(value, str):
    return value.strip() or None
  return value


# Surrounding space is dropped, and nothing but space means none.
Name = Annotated[Annotated[str, Field(max_length=120)] | None, BeforeValidator(_blank_as_none)]
Note = Annotated[Annotated[str, Field(max_length=1000)] | None, BeforeValidator(_blank_as_none)]

MAX_TAGS = 20


def _single_spaced(value: object) -> object:
  return " ".join(value.split()) if isinstance(value, str) else value


def distinct_tags(tags: list[str]) -> list[str]:
  """Each tag once, whatever its case, as first written."""
  seen: dict[str, str] = {}
  for tag in tags:
    seen.setdefault(tag.casefold(), tag)
  return list(seen.values())


Tag = Annotated[str, BeforeValidator(_single_spaced), StringConstraints(min_length=1, max_length=50)]
Tags = Annotated[list[Tag], Field(max_length=MAX_TAGS), AfterValidator(distinct_tags)]


class TransactionSchema(IDSchema, TimestampedSchema):
  amount: int = Field(description="Amount in minor units (cents).")
  currency: str
  transaction_date: date
  direction: TransactionDirection
  description: str | None = Field(description="The bank's own text, never changed.")
  name: str | None = Field(default=None, description="What the user calls it, shown in place of the bank's text.")
  note: str | None = Field(default=None, description="The user's own words about this one transaction.")
  category_id: UUID4 | None
  transaction_type: str | None
  logo_url: str | None = Field(default=None, description="The merchant's logo, when the source provides it.")
  document_count: int = Field(default=0, description="Invoices and receipts kept with it.")
  dedup_hash: str
  bank_account_id: UUID4
  raw_id: UUID4 | None
  is_business: bool = Field(default=False, description="Marked as a business transaction, such as a company cost paid privately.")
  company_account: bool = Field(default=False, description="On an account of the user's company, so company money whatever is_business says.")
  transfer_id: UUID4 | None = Field(
    default=None, description="Shared with the other side of a move between the user's own accounts; such pairs count as neither income nor spending."
  )
  tags: list[str] = Field(default_factory=list, description="The user's own tags, such as a trip or a project.")
  reviewed: bool = Field(default=True, description="Looked over by the user; imports arrive unreviewed.")

  @computed_field(description="For a broker's movement, what it is, such as a buy or a tax.")  # type: ignore[prop-decorator]
  @property
  def investment_kind(self) -> InvestmentKind | None:
    return investment_kind(self.transaction_type, self.description)


class TransactionUpdate(Schema):
  category_id: UUID4 | None = Field(default=None, description="Category ID to assign.")
  is_business: bool | None = Field(default=None, description="Mark as a business transaction.")
  note: Note = Field(default=None, description="The user's own words about it; empty removes it.")
  tags: Tags | None = Field(default=None, description="Replaces its tags; a tag the user already has elsewhere keeps that spelling.")
  reviewed: bool | None = Field(default=None, description="Mark it reviewed, or back to be reviewed.")


class TransactionRename(Schema):
  name: Name = Field(description="What to call it; empty goes back to the bank's text.")


class NameSuggestion(Schema):
  description: str = Field(description="Bank text that would get the same name.")
  count: int = Field(description="How many transactions have it.")
  replacing: str | None = Field(default=None, description="The name its transactions have now, which naming it takes over; send it back when naming.")


class TransactionRenameResponse(TransactionSchema):
  suggestions: list[NameSuggestion] = Field(
    description="Others that likely want the same name: first this one's own bank text, if others have it, then similar ones."
  )


class NameAllRequest(Schema):
  description: str = Field(min_length=1, description="Exact bank text to name, now and in later imports.")
  name: Annotated[str, BeforeValidator(_blank_as_none), Field(max_length=120)]
  replacing: Name = Field(default=None, description="A name given by hand that these transactions should give up, from the suggestion.")


class NameAllResponse(Schema):
  renamed: int = Field(description="How many transactions got the name.")


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


class BulkTagRequest(Schema):
  ids: list[UUID4] = Field(description="Transactions to tag.")
  add: Tags = Field(default_factory=list, description="Tags to add to each; a tag the user already has keeps that spelling.")
  remove: list[Tag] = Field(default_factory=list, description="Tags to take off each, whatever their case.")


class BulkReviewRequest(Schema):
  ids: list[UUID4] = Field(description="Transactions to mark.")
  reviewed: bool = Field(default=True, description="False puts them back to be reviewed.")


class TagTotal(Schema):
  currency: str
  spent: int = Field(description="Money out, in minor units.")
  received: int = Field(description="Money in, such as refunds or someone paying back their share, in minor units.")


class TagSummary(Schema):
  tag: str
  count: int = Field(description="Tagged transactions in the period.")
  totals: list[TagTotal] = Field(description="One per currency, never added together; most spent first.")


class TagListResponse(Schema):
  items: list[TagSummary] = Field(description="The user's tags used in the period, most used first. Moves between own accounts are left out.")


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
