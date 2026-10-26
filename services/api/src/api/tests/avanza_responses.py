"""Builders for Avanza's web API responses, in the shapes the desktop app uploads them."""

from typing import Any


def money(value: float, unit: str = "SEK") -> dict[str, Any]:
  return {"value": value, "unit": unit, "unitType": "MONETARY", "decimalPrecision": 2}


def account(account_id: str, account_type: str = "INVESTERINGSSPARKONTO", *, name: str = "ISK", cash: float = 0.0) -> dict[str, Any]:
  return {"id": account_id, "type": account_type, "name": {"defaultName": account_type.title(), "userDefinedName": name}, "balance": money(cash)}


def instrument(isin: str, name: str, *, kind: str = "STOCK", currency: str = "SEK") -> dict[str, Any]:
  return {"isin": isin, "name": name, "type": kind, "currency": currency}


def position(account_id: str, inst: dict[str, Any], *, volume: float, value: float, acquired: float, unit: str = "SEK") -> dict[str, Any]:
  return {
    "account": {"id": account_id},
    "instrument": inst,
    "volume": {"value": volume, "unit": "st"},
    "value": money(value, unit),
    "acquiredValue": money(acquired, unit),
  }


def movement(
  movement_id: str,
  account_id: str,
  kind: str,
  day: str,
  amount: float,
  *,
  inst: dict[str, Any] | None = None,
  volume: float | None = None,
  price: float | None = None,
  price_unit: str = "SEK",
  commission: float | None = None,
  intraday: bool = False,
  description: str | None = None,
) -> dict[str, Any]:
  return {
    "id": movement_id,
    "account": {"id": account_id},
    "type": kind,
    "date": f"{day}T10:00:00",
    "tradeDate": day,
    "amount": money(amount),
    "description": description or kind.title(),
    "intraday": intraday,
    "orderbook": inst,
    "instrumentName": inst["name"] if inst else None,
    "isin": inst["isin"] if inst else "",
    "volume": {"value": volume, "unit": "st"} if volume is not None else None,
    "priceInTradedCurrency": money(price, price_unit) if price is not None else None,
    "commission": money(commission) if commission is not None else None,
  }


def overview(*accounts: dict[str, Any]) -> dict[str, Any]:
  return {"categories": [], "accounts": list(accounts), "loans": []}


def positions(*rows: dict[str, Any]) -> dict[str, Any]:
  return {"withOrderbook": list(rows), "withoutOrderbook": [], "cashPositions": []}


def transactions(*rows: dict[str, Any]) -> dict[str, Any]:
  return {"transactions": list(rows), "transactionsAfterFiltering": len(rows), "firstTransactionDate": "2020-01-02"}
