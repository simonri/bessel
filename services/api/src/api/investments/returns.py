"""Time- and money-weighted returns from an account's values on the days they're known and the money moved in and out.

Values are end-of-day. A flow on a valuation day is already in that day's value, so a period runs from the day
after one valuation to the next one. Amounts are minor units; returns are fractions (0.05 is 5%).
"""

import math
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field, replace
from datetime import date

DAYS_PER_YEAR = 365


@dataclass(frozen=True)
class Ledger:
  """One portfolio: what it was worth on each day that's known, and what was put in (above zero) or taken out on each day."""

  values: Mapping[date, int]
  flows: Mapping[date, int] = field(default_factory=dict)


@dataclass(frozen=True)
class Returns:
  start: date | None = None
  end: date | None = None
  start_value: int | None = None
  end_value: int | None = None
  net_flows: int | None = None
  time_weighted: float | None = None
  money_weighted: float | None = None
  time_weighted_unavailable: str | None = None
  money_weighted_unavailable: str | None = None

  @property
  def days(self) -> int | None:
    return (self.end - self.start).days if self.start and self.end else None

  @property
  def gain(self) -> int | None:
    """What the portfolio made over the period beyond the money moved in and out."""
    if self.start_value is None or self.end_value is None or self.net_flows is None:
      return None
    return self.end_value - self.start_value - self.net_flows

  def annualized(self, rate: float | None) -> float | None:
    """The rate per year, only over a year or more: annualizing a month's return overstates it."""
    days = self.days
    if rate is None or days is None or days < DAYS_PER_YEAR or rate <= -1:
      return None
    return (1 + rate) ** (DAYS_PER_YEAR / days) - 1


def unavailable(reason: str) -> Returns:
  return Returns(time_weighted_unavailable=reason, money_weighted_unavailable=reason)


def values_on(days: Iterable[date], *, base_balance: int, daily_net: Mapping[date, int], holdings: Mapping[date, int]) -> dict[date, int]:
  """An investment account's worth at the end of each of `days`: its cash then plus its holdings on the latest
  snapshot by then. Days before its first snapshot are left out, since nothing says what it held."""
  if not holdings:
    return {}
  first = min(holdings)
  snapshots = sorted(holdings)
  net_days = sorted(daily_net)
  values: dict[date, int] = {}
  cash, net_index, held, snapshot_index = base_balance, 0, 0, 0
  for day in sorted(set(days)):
    while net_index < len(net_days) and net_days[net_index] <= day:
      cash += daily_net[net_days[net_index]]
      net_index += 1
    while snapshot_index < len(snapshots) and snapshots[snapshot_index] <= day:
      held = holdings[snapshots[snapshot_index]]
      snapshot_index += 1
    if day >= first:
      values[day] = cash + held
  return values


def combine(ledgers: Iterable[Ledger]) -> Ledger:
  """Several accounts as one portfolio, valued on the days any of them is. Each ledger must hold its account's value
  on every one of those days from its first. An account Bessel starts valuing later joins as if its value were put in
  that day, so the history starting does not count as a gain."""
  ledgers = [ledger for ledger in ledgers if ledger.values]
  if not ledgers:
    return Ledger(values={})
  start = min(min(ledger.values) for ledger in ledgers)
  values: dict[date, int] = {}
  flows: dict[date, int] = {}
  for ledger in ledgers:
    first = min(ledger.values)
    for day, value in ledger.values.items():
      values[day] = values.get(day, 0) + value
    for day, amount in ledger.flows.items():
      if day > first:
        flows[day] = flows.get(day, 0) + amount
    if first > start:
      flows[first] = flows.get(first, 0) + ledger.values[first]
  return Ledger(values=values, flows=flows)


def period_returns(ledger: Ledger, *, start: date | None, end: date) -> Returns:
  """Returns from the last valuation on or before `start` (the first after it for a portfolio valued only since,
  or the very first for no start) to the last one on or before `end`."""
  days = sorted(day for day in ledger.values if day <= end)
  if not days:
    return unavailable("Bessel has no values for this yet. They start with the first broker sync.")
  before = [day for day in days if start is not None and day <= start]
  first = before[-1] if before else next((day for day in days if start is None or day > start), days[0])
  days = [day for day in days if day >= first]
  if len(days) < 2:
    return unavailable("Bessel needs values from two different days in this range.")

  last = days[-1]
  flows = {day: amount for day, amount in ledger.flows.items() if first < day <= last and amount != 0}
  base = Returns(
    start=first,
    end=last,
    start_value=ledger.values[first],
    end_value=ledger.values[last],
    net_flows=sum(flows.values()),
  )
  twr, twr_reason = _time_weighted(ledger.values, flows, days)
  mwr, mwr_reason = _money_weighted(ledger.values[first], ledger.values[last], flows, first, last)
  return replace(
    base,
    time_weighted=twr,
    money_weighted=mwr,
    time_weighted_unavailable=twr_reason,
    money_weighted_unavailable=mwr_reason,
  )


def _time_weighted(values: Mapping[date, int], flows: Mapping[date, int], days: list[date]) -> tuple[float | None, str | None]:
  """Each stretch between two valuations is weighed by Modified Dietz (a flow counts for the share of the stretch it
  was invested), and the stretches are chained, so how much money was in when does not sway the result."""
  growth = 1.0
  flow_days = sorted(flows)
  index = 0
  for previous, current in zip(days, days[1:], strict=False):
    length = (current - previous).days
    within: list[tuple[date, int]] = []
    while index < len(flow_days) and flow_days[index] <= current:
      if flow_days[index] > previous:
        within.append((flow_days[index], flows[flow_days[index]]))
      index += 1
    moved = sum(amount for _, amount in within)
    gain = values[current] - values[previous] - moved
    invested = values[previous] + sum(amount * (current - day).days / length for day, amount in within)
    # Money put into an empty account and valued the same day: it was in for the whole stretch.
    if invested <= 0 < moved and values[previous] >= 0:
      invested = values[previous] + moved
    if invested <= 0:
      if gain == 0:
        continue
      return None, f"The value was zero or below around {previous.isoformat()}, so the return can't be worked out across it."
    growth *= 1 + gain / invested
    if growth <= 0:
      return None, "Everything was lost along the way, so the return can't be chained past it."
  return growth - 1, None


def _money_weighted(start_value: int, end_value: int, flows: Mapping[date, int], start: date, end: date) -> tuple[float | None, str | None]:
  """The one steady rate at which the starting value and each flow would have grown into the end value (XIRR),
  given for the whole period rather than per year."""
  # From the investor's side: the start value and deposits go in, withdrawals and the end value come back out.
  cash_flows = [(0, -start_value), *(((day - start).days, -amount) for day, amount in flows.items()), ((end - start).days, end_value)]
  cash_flows = [(t, amount) for t, amount in cash_flows if amount != 0]
  if not any(amount > 0 for _, amount in cash_flows) or not any(amount < 0 for _, amount in cash_flows):
    return None, "Money only went one way in this range, so there's no rate to work out."
  span = (end - start).days

  def npv(rate: float) -> float:
    """Net value at the start with `rate` per day, compounded continuously."""
    return sum(amount * math.exp(-rate * t) for t, amount in cash_flows)

  low, high = -1.0 / span, 1.0 / span
  # Up to e^±512 over the period: anything past that is no rate worth showing.
  for _ in range(10):
    if npv(low) * npv(high) < 0:
      break
    low, high = low * 2, high * 2
  else:
    return None, "No single rate fits the money moved in this range."
  for _ in range(200):
    middle = (low + high) / 2
    if npv(low) * npv(middle) <= 0:
      high = middle
    else:
      low = middle
  return math.expm1((low + high) / 2 * span), None
