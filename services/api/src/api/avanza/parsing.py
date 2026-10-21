"""Turns Avanza's JSON into plain values. Every field Bessel relies on is read here."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from api.models.security import AssetType

ASSET_TYPES = {
  "STOCK": AssetType.stock,
  "FUND": AssetType.mutual_fund,
  "EXCHANGE_TRADED_FUND": AssetType.etf,
  "BOND": AssetType.bond,
}
TRADE_TYPES = {"BUY", "SELL"}


@dataclass(frozen=True, slots=True)
class Account:
  external_id: str
  name: str
  account_type: str
  cash: Decimal
  currency: str


@dataclass(frozen=True, slots=True)
class Instrument:
  isin: str
  name: str
  asset_type: AssetType
  currency: str


@dataclass(frozen=True, slots=True)
class Position:
  account_id: str
  instrument: Instrument
  quantity: Decimal
  value: Decimal
  acquired_value: Decimal
  currency: str


@dataclass(frozen=True, slots=True)
class Movement:
  """One row of Avanza's transaction list: a cash movement, and for buys and sells also a trade."""

  external_id: str
  account_id: str
  type: str
  day: date
  # Signed, in the account's currency: what the account's cash changed by.
  amount: Decimal
  currency: str
  description: str
  # Settled once Avanza no longer marks it as intraday.
  settled: bool
  instrument: Instrument | None
  quantity: Decimal | None
  price: Decimal | None
  price_currency: str | None
  commission: Decimal | None


def _number(field: dict[str, Any] | None) -> Decimal | None:
  if not field or field.get("value") is None:
    return None
  return Decimal(str(field["value"]))


def accounts(overview: dict[str, Any]) -> list[Account]:
  out = []
  for account in overview.get("accounts", []):
    name = account.get("name") or {}
    balance = account.get("balance") or {}
    out.append(
      Account(
        external_id=str(account["id"]),
        name=name.get("userDefinedName") or name.get("defaultName") or account.get("type", "Account"),
        account_type=account.get("type", ""),
        cash=_number(balance) or Decimal(0),
        currency=balance.get("unit") or "SEK",
      )
    )
  return out


def _instrument(raw: dict[str, Any] | None, *, name: str | None = None, isin: str | None = None) -> Instrument | None:
  raw = raw or {}
  isin = raw.get("isin") or isin
  if not isin:
    return None
  return Instrument(
    isin=isin,
    name=raw.get("name") or name or isin,
    asset_type=ASSET_TYPES.get(str(raw.get("type", "")).upper(), AssetType.other),
    currency=raw.get("currency") or "SEK",
  )


def positions(body: dict[str, Any]) -> list[Position]:
  out = []
  for group in ("withOrderbook", "withoutOrderbook"):
    for row in body.get(group) or []:
      instrument = _instrument(row.get("instrument"))
      value = row.get("value") or {}
      if instrument is None:
        continue
      out.append(
        Position(
          account_id=str(row["account"]["id"]),
          instrument=instrument,
          quantity=_number(row.get("volume")) or Decimal(0),
          value=_number(value) or Decimal(0),
          acquired_value=_number(row.get("acquiredValue")) or Decimal(0),
          currency=value.get("unit") or "SEK",
        )
      )
  return out


def movements(body: dict[str, Any]) -> list[Movement]:
  out = []
  for row in body.get("transactions") or []:
    amount = row.get("amount") or {}
    orderbook = row.get("orderbook")
    instrument = _instrument(orderbook, name=row.get("instrumentName"), isin=row.get("isin"))
    price = row.get("priceInTradedCurrency") or {}
    out.append(
      Movement(
        external_id=str(row["id"]),
        account_id=str(row["account"]["id"]),
        type=str(row.get("type", "UNKNOWN")).upper(),
        day=date.fromisoformat((row.get("tradeDate") or row["date"])[:10]),
        amount=_number(amount) or Decimal(0),
        currency=amount.get("unit") or "SEK",
        description=row.get("description") or row.get("instrumentName") or str(row.get("type", "")).title(),
        settled=not row.get("intraday", False),
        instrument=instrument,
        quantity=_number(row.get("volume")),
        price=_number(price),
        price_currency=price.get("unit") or (orderbook or {}).get("currency"),
        commission=_number(row.get("commission")),
      )
    )
  return out
