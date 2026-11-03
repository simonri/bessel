from datetime import date

from pydantic import UUID4, Field

from api.common.schemas import IDSchema, Schema
from api.models.recurring_series import RecurringDecision, RecurringKind
from api.models.transaction import TransactionDirection
from api.recurring.detection import Cadence, Status


class PriceChangeSchema(Schema):
  date: date
  old_amount: int
  new_amount: int


class RecurringSeriesSchema(Schema):
  key: str = Field(description="The group of transactions it comes from; with `typical_amount`, what a review refers to.")
  review_id: UUID4 | None = Field(description="The user's review of it, if any.")
  decision: RecurringDecision | None
  name: str = Field(description="The user's name for it, or what the transactions are called.")
  detected_name: str
  kind: RecurringKind
  cadence: Cadence
  currency: str
  direction: TransactionDirection
  is_business: bool = Field(description="The company's money rather than the user's own.")
  bank_account_id: UUID4 = Field(description="The account its latest payment was on.")
  logo_url: str | None
  typical_amount: int = Field(description="Minor units: the latest price, or the middle of recent amounts when they vary.")
  variable: bool = Field(description="Whether the amount changes from one payment to the next.")
  monthly_amount: int = Field(description="What it comes to in an average month, in minor units.")
  count: int = Field(description="Payments seen in a row on this schedule.")
  first_date: date
  last_date: date
  last_amount: int
  status: Status
  next_date: date | None = Field(description="When the next payment is expected; earlier than today when it's late, none once it has ended.")
  next_amount: int | None
  price_changes: list[PriceChangeSchema] = Field(description="Oldest first.")


class UpcomingPayment(Schema):
  key: str
  typical_amount: int
  name: str
  kind: RecurringKind
  date: date
  amount: int
  currency: str
  direction: TransactionDirection
  is_business: bool
  bank_account_id: UUID4
  late: bool = Field(description="Was due before today and hasn't been seen yet.")


class RecurringTotal(Schema):
  currency: str
  is_business: bool
  money_out: int = Field(description="Bills and subscriptions in an average month, in minor units.")
  subscriptions: int = Field(description="The subscriptions among them.")
  money_in: int = Field(description="Income in an average month.")


class RecurringResponse(Schema):
  series: list[RecurringSeriesSchema] = Field(description="Every series detected, dismissed ones included, the latest payment first.")
  upcoming: list[UpcomingPayment] = Field(description="Late payments, then those expected from today on, soonest first; none from dismissed or ended series.")
  totals: list[RecurringTotal] = Field(description="Per currency and owner, from series still running; currencies are never added together.")


class RecurringReviewCreate(Schema):
  key: str = Field(max_length=300)
  typical_amount: int
  decision: RecurringDecision | None = None
  name: str | None = Field(default=None, min_length=1, max_length=120)
  kind: RecurringKind | None = None


class RecurringReviewUpdate(Schema):
  decision: RecurringDecision | None = Field(default=None, description="Null takes back a confirmation or dismissal.")
  name: str | None = Field(default=None, min_length=1, max_length=120, description="Null goes back to the detected name.")
  kind: RecurringKind | None = Field(default=None, description="Null goes back to the detected kind.")


class RecurringReviewSchema(IDSchema):
  key: str
  typical_amount: int
  decision: RecurringDecision | None
  name: str | None
  kind: RecurringKind | None
