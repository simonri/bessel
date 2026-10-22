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
  current_balance: int = Field(default=0, description="Current balance in minor units (base_balance + credits - debits).")


class BankAccountCreate(Schema):
  name: str = Field(description="Display name of the bank account.")
  currency: str = Field(description="ISO 4217 currency code.", max_length=3)
  base_balance: int = Field(default=0, description="Starting balance in minor units (cents).")
  subtype: str = Field(description="Account subtype, e.g. 'checking', 'savings'.")
  is_business: bool = Field(default=False, description="Whether the account belongs to the user's company rather than the user.")


class BankAccountUpdate(Schema):
  name: str | None = Field(default=None, description="Display name of the bank account.")
  currency: str | None = Field(default=None, description="ISO 4217 currency code.", max_length=3)
  base_balance: int | None = Field(default=None, description="Starting balance in minor units (cents).")
  subtype: str | None = Field(default=None, description="Account subtype, e.g. 'checking', 'savings'.")
  is_business: bool | None = Field(default=None, description="Whether the account belongs to the user's company rather than the user.")


class BankAccountListResponse(ListResource[BankAccountSchema]):
  pass


class AccountSource(Schema):
  kind: Literal["bank", "avanza", "klarna", "manual"] = Field(description="Where the account's transactions come from.")
  label: str = Field(description="The source as the user knows it, such as 'Skandia' or 'Imported by hand'.")
  synced_at: datetime | None = Field(description="The last sync or import that worked.")
  problem: str | None = Field(description="What needs the user's attention, if anything.")


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


class AccountsOverviewResponse(Schema):
  accounts: list[AccountOverview]
  totals: list[OverviewTotal] = Field(description="Per owner and currency; currencies are never added together.")
