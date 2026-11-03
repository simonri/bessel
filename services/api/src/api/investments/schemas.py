from datetime import date
from typing import Literal

from pydantic import UUID4, Field

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema
from api.models.security import AssetType
from api.models.trade import TradeType

# --- Trades ---


class TradeSchema(IDSchema, TimestampedSchema):
  security_id: UUID4
  security_name: str
  bank_account_id: UUID4
  bank_account_name: str
  trade_type: TradeType
  trade_date: date
  quantity: int = Field(description="Quantity in micro-units (x1,000,000).")
  price_per_unit: int = Field(description="Price per unit in minor units (cents).")
  currency: str
  notes: str | None


class TradeListResponse(ListResource[TradeSchema]):
  pass


# --- Holdings ---


class HoldingSchema(Schema):
  security_id: UUID4
  bank_account_id: UUID4 | None = Field(default=None, description="The account holding it, for accounts a broker syncs.")
  security_name: str
  ticker: str | None
  asset_type: AssetType
  currency: str
  quantity: int = Field(description="Net quantity in micro-units (x1,000,000).")
  avg_cost_per_unit: int = Field(description="Average cost per unit in minor units (cents).")
  cost_basis: int = Field(description="Total cost basis in minor units (cents).")
  current_price: int | None = Field(description="Latest price per unit in minor units, or null if no price recorded.")
  current_value: int | None = Field(description="Current value in minor units, or null if no price recorded.")
  gain_loss: int | None = Field(description="Unrealized gain/loss in minor units, or null if no price.")
  gain_loss_pct: float | None = Field(description="Unrealized gain/loss percentage, or null if no price or zero cost.")


class HoldingsResponse(Schema):
  items: list[HoldingSchema]


class YearAmount(Schema):
  year: int
  amount: int = Field(description="In minor units.")


class InvestmentAccountSummary(Schema):
  bank_account_id: UUID4
  name: str
  is_business: bool
  currency: str
  holdings_value: int = Field(description="What the holdings are worth, in minor units.")
  cash: int = Field(description="Uninvested cash in the account, in minor units.")
  total: int = Field(description="Holdings plus cash.")
  acquired_value: int = Field(description="What the current holdings cost, in minor units.")
  deposits: int = Field(description="All money put into the account, in minor units.")
  withdrawals: int = Field(description="All money taken out of the account, in minor units.")
  net_deposits: int = Field(description="Deposits minus withdrawals.")
  growth: int = Field(description="Total minus net deposits: what the account made or lost overall.")
  dividends: list[YearAmount] = Field(description="Dividends received per year, newest first.")
  interest: list[YearAmount] = Field(description="Interest per year, newest first; below zero when paying it on a loan.")
  tax: list[YearAmount] = Field(description="Tax per year, such as a KF's yield tax, newest first; below zero.")
  fees: list[YearAmount] = Field(description="Fees per year, newest first; below zero.")
  first_transaction: date | None


class InvestmentAccountsResponse(Schema):
  items: list[InvestmentAccountSummary]


# --- Performance ---

PerformanceRange = Literal["1m", "3m", "ytd", "1y", "all"]
PERFORMANCE_RANGES: tuple[PerformanceRange, ...] = ("1m", "3m", "ytd", "1y", "all")


class ValuePoint(Schema):
  day: date
  value: int = Field(description="Holdings plus cash at the end of the day, in minor units.")


class PortfolioSeries(Schema):
  bank_account_id: UUID4 | None = Field(description="The account, or null for all the accounts in the currency together.")
  currency: str
  points: list[ValuePoint] = Field(description="On each day the broker reported the positions, oldest first.")


class PeriodReturns(Schema):
  bank_account_id: UUID4 | None = Field(description="The account, or null for all the accounts in the currency together.")
  currency: str
  range: PerformanceRange
  start: date | None = Field(description="The day the returns are measured from: later than the range's start when values only begin later.")
  end: date | None
  start_value: int | None = Field(description="In minor units.")
  end_value: int | None = Field(description="In minor units.")
  net_flows: int | None = Field(description="Deposits minus withdrawals over the period, in minor units.")
  gain: int | None = Field(description="End value minus start value minus net flows: what the money made, in minor units.")
  time_weighted: float | None = Field(description="Time-weighted return over the period, as a fraction (0.05 is 5%).")
  time_weighted_annualized: float | None = Field(description="Per year, for periods of a year or more.")
  time_weighted_unavailable: str | None = Field(description="Why there's no time-weighted return.")
  money_weighted: float | None = Field(description="Money-weighted return (XIRR) over the period, as a fraction.")
  money_weighted_annualized: float | None = Field(description="Per year, for periods of a year or more.")
  money_weighted_unavailable: str | None = Field(description="Why there's no money-weighted return.")


class LeftOutAccount(Schema):
  bank_account_id: UUID4
  name: str
  reason: str


class InvestmentPerformanceResponse(Schema):
  series: list[PortfolioSeries]
  returns: list[PeriodReturns] = Field(description="For each account and each currency's total, one per range.")
  left_out: list[LeftOutAccount] = Field(description="Accounts not counted in the totals' returns, and why.")


# --- Allocation ---


class AllocationSlice(Schema):
  key: str = Field(description="The asset type, or the account's id.")
  label: str
  value: int = Field(description="In minor units.")
  share: float = Field(description="Of the currency's whole, as a fraction.")


class CurrencyAllocation(Schema):
  currency: str
  total: int = Field(description="Everything counted, in minor units.")
  by_asset_type: list[AllocationSlice] = Field(description="Holdings by type, with uninvested cash as its own slice.")
  by_account: list[AllocationSlice] = Field(description="Largest first.")
  borrowed: int = Field(description="Cash below zero across the accounts, in minor units; not in the slices.")
  unpriced: int = Field(description="How many holdings have no price and so aren't counted.")


class InvestmentAllocationResponse(Schema):
  items: list[CurrencyAllocation]


# --- Crypto ---


class CryptoPriceSchema(Schema):
  coin_id: str
  currency: str
  price: float
  price_change_pct_24h: float | None = None
