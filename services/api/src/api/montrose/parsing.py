"""Montrose's transactions and holdings, as its MCP tools return them, in the shape Bessel imports."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

# Montrose's categories, as the movement types the investment pages already know (see investments/kinds.py).
TYPES = {
  "Buy": "BUY",
  "Sell": "SELL",
  "Deposit": "DEPOSIT",
  "Withdrawal": "WITHDRAW",
  "Dividend": "DIVIDEND",
  "Interest": "INTEREST",
  "ForeignTax": "FOREIGN_TAX",
  "WithholdingTax": "TAX",
  "CurrencyExchange": "CURRENCY_EXCHANGE",
  "CorporateAction": "CORPORATE_ACTION",
  "SecuritiesTransferIn": "TRANSFER_IN",
  "SecuritiesTransferOut": "TRANSFER_OUT",
}
VERBS = {"Buy": "Köp", "Sell": "Sälj", "Dividend": "Utdelning", "SecuritiesTransferIn": "Inflyttad", "SecuritiesTransferOut": "Utflyttad"}
FALLBACK_TEXT = {"Deposit": "Insättning", "Withdrawal": "Uttag", "Interest": "Ränta", "ForeignTax": "Utländsk skatt", "WithholdingTax": "Källskatt"}


@dataclass(frozen=True, slots=True)
class Movement:
  external_id: str
  account_id: str
  category: str
  day: date
  quantity: Decimal
  price: Decimal
  price_currency: str
  amount: Decimal
  # Empty when no money moved, such as for rights handed out in a share issue.
  currency: str
  orderbook_id: int
  text: str
  canceled: bool

  @property
  def moves_cash(self) -> bool:
    return bool(self.currency) and self.amount != 0 and not self.canceled

  @property
  def transaction_type(self) -> str:
    return TYPES.get(self.category, "OTHER")

  def description(self, instrument: str | None) -> str:
    if (verb := VERBS.get(self.category)) and instrument:
      return f"{verb} {instrument}"
    return self.text.strip() or FALLBACK_TEXT.get(self.category) or verb or self.category


@dataclass(frozen=True, slots=True)
class Position:
  account_id: str
  orderbook_id: int
  name: str
  ticker: str
  quantity: Decimal
  currency: str
  # In the account's currency; None for something Montrose can't price, such as subscription rights.
  value: Decimal | None
  acquired_value: Decimal | None


@dataclass(frozen=True, slots=True)
class Holdings:
  account_id: str
  currency: str
  cash: Decimal
  positions: list[Position]


def _decimal(value: Any) -> Decimal:
  return Decimal(str(value))


def movements(rows: list[dict[str, Any]]) -> list[Movement]:
  return [
    Movement(
      external_id=str(row["id"]),
      account_id=str(row["accountId"]),
      category=str(row["category"]),
      day=date.fromisoformat(row["tradeDate"]),
      quantity=_decimal(row.get("quantity") or 0),
      price=_decimal(row.get("price") or 0),
      price_currency=str(row.get("priceCurrency") or ""),
      amount=_decimal(row.get("amount") or 0),
      currency=str(row.get("currency") or ""),
      orderbook_id=int(row.get("orderbookId") or 0),
      text=str(row.get("text") or ""),
      canceled=bool(row.get("isCanceled")),
    )
    for row in rows
  ]


def holdings(accounts: list[dict[str, Any]]) -> list[Holdings]:
  found = []
  for account in accounts:
    currency = str(account["currency"])
    cash = sum((_decimal(p["balance"]) for p in account.get("currencyPositions") or [] if p.get("currencyCode") == currency), Decimal(0))
    positions = []
    for row in account.get("positions") or []:
      value = (row.get("marketValue") or {}).get("accountCurrency")
      result = (row.get("unrealizedResult") or {}).get("accountCurrency")
      positions.append(
        Position(
          account_id=str(account["accountId"]),
          orderbook_id=int(row.get("orderbookId") or 0),
          name=str(row["instrumentName"]),
          ticker=str(row.get("ticker") or ""),
          quantity=_decimal(row["quantity"]),
          currency=str(row.get("instrumentCurrency") or currency),
          value=None if value is None else _decimal(value),
          acquired_value=None if value is None or result is None else _decimal(value) - _decimal(result),
        )
      )
    found.append(Holdings(account_id=str(account["accountId"]), currency=currency, cash=cash, positions=positions))
  return found
