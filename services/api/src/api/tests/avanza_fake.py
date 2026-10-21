"""An in-memory Avanza web API, served over httpx.MockTransport, enough of it for Bessel's reads."""

import json
from dataclasses import dataclass, field
from typing import Any

import httpx
import pyotp

TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"
TOKEN = "security-token"


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


@dataclass
class FakeAvanza:
  username: str = "simon"
  password: str = "hunter2"
  accounts: list[dict[str, Any]] = field(default_factory=list)
  positions: list[dict[str, Any]] = field(default_factory=list)
  movements: list[dict[str, Any]] = field(default_factory=list)
  logins: int = 0
  transaction_requests: list[dict[str, str]] = field(default_factory=list)
  # Status every data route answers with instead, e.g. 500 to simulate an outage.
  fail_with: int | None = None
  # How many correct codes to turn down first, as Avanza does with a code that was just used.
  reject_codes: int = 0
  # A whole positions response, used as is instead of `positions`.
  positions_body: dict[str, Any] | None = None

  def transport(self) -> httpx.MockTransport:
    return httpx.MockTransport(self._handle)

  def _handle(self, request: httpx.Request) -> httpx.Response:
    path = request.url.path
    if path == "/_api/authentication/sessions/usercredentials":
      body = json.loads(request.content)
      if (body["username"], body["password"]) != (self.username, self.password):
        return httpx.Response(401, json={"message": "Felaktigt användarnamn eller lösenord"})
      return httpx.Response(200, json={"twoFactorLogin": {"method": "TOTP", "transactionId": "t1"}})
    if path == "/_api/authentication/sessions/totp":
      code = json.loads(request.content)["totpCode"]
      if self.reject_codes > 0:
        self.reject_codes -= 1
        return httpx.Response(401, json={"message": "Koden har redan använts"})
      if not pyotp.TOTP(TOTP_SECRET).verify(code, valid_window=1):
        return httpx.Response(401, json={"message": "Felaktig kod"})
      self.logins += 1
      return httpx.Response(200, headers={"X-SecurityToken": TOKEN}, json={"authenticationSession": "s", "pushSubscriptionId": "p", "customerId": "c"})
    if request.headers.get("X-SecurityToken") != TOKEN:
      return httpx.Response(401, json={"message": "Not logged in"})
    if self.fail_with:
      return httpx.Response(self.fail_with, json={"message": "Internal error, account 1234"})
    if path == "/_api/account-overview/overview/categorizedAccounts":
      return httpx.Response(200, json={"categories": [], "accounts": self.accounts, "loans": []})
    if path == "/_api/position-data/positions":
      body = self.positions_body or {"withOrderbook": self.positions, "withoutOrderbook": [], "cashPositions": []}
      return httpx.Response(200, json=body)
    if path == "/_api/transactions/list":
      params = dict(request.url.params)
      self.transaction_requests.append(params)
      matching = [m for m in self.movements if params["from"] <= m["tradeDate"] <= params["to"]]
      limit = int(params["maxElements"])
      return httpx.Response(200, json={"transactions": matching[:limit], "transactionsAfterFiltering": len(matching), "firstTransactionDate": "2020-01-02"})
    return httpx.Response(404, json={"message": path})
