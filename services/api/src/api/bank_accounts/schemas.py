from datetime import date, datetime
from typing import Literal

from pydantic import Field

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema


class BankAccountSchema(IDSchema, TimestampedSchema):
  name: str = Field(description="Display name of the bank account.")
  currency: str = Field(description="ISO 4217 currency code.")
  base_balance: int = Field(description="Starting balance in minor units (cents).")
  subtype: str = Field(description="Account subtype, e.g. 'checking', 'savings'.")
  is_business: bool = Field(description="Whether the account belongs to the user's company rather than the user.")
  include_in_net_worth: bool = Field(description="Whether the account counts toward net worth.")
  current_balance: int = Field(default=0, description="Current balance in minor units (base_balance + credits - debits).")


class BankAccountCreate(Schema):
  name: str = Field(description="Display name of the bank account.")
  currency: str = Field(description="ISO 4217 currency code.", max_length=3)
  base_balance: int = Field(default=0, description="Starting balance in minor units (cents).")
  subtype: str = Field(description="Account subtype, e.g. 'checking', 'savings'.")
  is_business: bool = Field(default=False, description="Whether the account belongs to the user's company rather than the user.")
  include_in_net_worth: bool = Field(default=True, description="Whether the account counts toward net worth.")


class BankAccountUpdate(Schema):
  name: str | None = Field(default=None, description="Display name of the bank account.")
  currency: str | None = Field(default=None, description="ISO 4217 currency code.", max_length=3)
  base_balance: int | None = Field(default=None, description="Starting balance in minor units (cents).")
  subtype: str | None = Field(default=None, description="Account subtype, e.g. 'checking', 'savings'.")
  is_business: bool | None = Field(default=None, description="Whether the account belongs to the user's company rather than the user.")
  include_in_net_worth: bool | None = Field(default=None, description="Whether the account counts toward net worth.")


class BankAccountListResponse(ListResource[BankAccountSchema]):
  pass


class AccountProblem(Schema):
  """What needs the user's attention; the app words it, so amounts and dates stay in its own formats."""

  kind: Literal["sync_failed", "not_shared", "stale", "renew_soon", "balance_mismatch", "sign_in", "import_due", "no_transactions"] = Field(
    description="What went wrong; not_shared means the latest bank approval left the account out, sign_in that the login was rejected."
  )
  day: date | None = Field(default=None, description="The last sync or import, or for renew_soon the day the approval ends.")
  source_balance: int | None = Field(default=None, description="For balance_mismatch, the balance the source reports, in minor units.")
  detail: str | None = Field(default=None, description="For sync_failed, what went wrong.")


class AccountSource(Schema):
  kind: Literal["bank", "avanza", "klarna", "manual"] = Field(description="Where the account's transactions come from.")
  label: str = Field(description="The source as the user knows it, such as 'Skandia' or 'Imported by hand'.")
  logo: str | None = Field(default=None, description="The bank's logo image URL, when one is known.")
  synced_at: datetime | None = Field(description="The last sync or import that worked.")
  access_until: datetime | None = Field(default=None, description="When the bank's read-only approval ends, for connected banks.")
  import_bank: str | None = Field(default=None, description="For accounts imported by hand, the bank of the latest export file, such as 'marginalen'.")
  problem: AccountProblem | None = Field(description="What needs the user's attention, if anything.")


class BalancePoint(Schema):
  month: date = Field(description="The month's first day.")
  balance: int = Field(description="The balance at the end of the month, in minor units.")


class AccountOverview(BankAccountSchema):
  group: Literal["cash", "investments", "credit"]
  source: AccountSource
  bank_balance: int | None = Field(description="The balance the bank or broker reported at the last sync, in minor units.")
  balance_drift: int | None = Field(description="The bank's balance minus Bessel's; anything but 0 means a transaction is missing.")
  holdings_value: int | None = Field(description="What the account's holdings are worth, for investment accounts, in minor units.")
  first_transaction: date | None
  last_transaction: date | None
  transaction_count: int
  history: list[BalancePoint] = Field(description="Month-end balances for up to a year, from the account's first transaction on.")


class OverviewTotal(Schema):
  owner: Literal["personal", "company"]
  currency: str
  cash: int = Field(description="Money in cash and savings accounts.")
  investments: int = Field(description="Investment accounts: holdings plus cash.")
  debt: int = Field(description="What is owed on credit accounts, as a positive amount.")
  net: int = Field(description="Cash plus investments minus debt.")


class NetWorthPoint(Schema):
  day: date
  value: int = Field(description="Net worth at the end of the day, in minor units.")


class NetWorthSeries(Schema):
  currency: str
  points: list[NetWorthPoint] = Field(description="The days net worth changed, oldest first, ending today.")


class NetWorthHistoryResponse(Schema):
  series: list[NetWorthSeries] = Field(description="Per currency, personal and company accounts counted toward net worth together.")


class AccountsOverviewResponse(Schema):
  accounts: list[AccountOverview]
  totals: list[OverviewTotal] = Field(description="Per owner and currency; currencies are never added together.")
