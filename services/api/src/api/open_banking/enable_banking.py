"""A small client for the Enable Banking account information API (api.enablebanking.com)."""

import time
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any

import httpx
from jose import jwt

API_URL = "https://api.enablebanking.com"
# Enable Banking rejects tokens that live longer than a day.
TOKEN_TTL_SECONDS = 3600
SESSION_GONE_ERRORS = {"EXPIRED_SESSION", "CLOSED_SESSION", "REVOKED_SESSION", "WRONG_SESSION_STATUS"}
# Booked balances first: they cover exactly the booked transactions Bessel imports.
# Klarna reports only "OTHR".
BALANCE_TYPES = ("CLBD", "ITBD", "XPCD", "ITAV", "CLAV", "OTHR")


class EnableBankingError(Exception):
  def __init__(self, status: int, code: str | None, message: str) -> None:
    super().__init__(message)
    self.status = status
    self.code = code


class SessionGoneError(EnableBankingError):
  """The bank consent behind the session expired or was revoked; the user has to approve again."""


@dataclass(frozen=True, slots=True)
class Bank:
  name: str
  country: str
  maximum_consent_seconds: int


@dataclass(frozen=True, slots=True)
class BankAccount:
  uid: str
  # Stable across sessions, unlike `uid`, which only lives as long as its session.
  identification_hash: str
  name: str | None
  iban: str | None
  currency: str


@dataclass(frozen=True, slots=True)
class Session:
  session_id: str
  valid_until: datetime
  accounts: list[BankAccount]


@dataclass(frozen=True, slots=True)
class BookedTransaction:
  reference: str | None
  booking_date: date
  amount: Decimal
  currency: str
  credit: bool
  description: str
  # The bank's transaction code, such as "CARD_TRANSACTION"; Klarna's transfers carry nothing else.
  code: str | None
  raw: dict[str, Any]


class EnableBankingClient:
  def __init__(self, http: httpx.AsyncClient, *, app_id: str, private_key: str) -> None:
    self._http = http
    self._app_id = app_id
    self._private_key = private_key

  def _token(self) -> str:
    now = int(time.time())
    claims = {"iss": "enablebanking.com", "aud": "api.enablebanking.com", "iat": now, "exp": now + TOKEN_TTL_SECONDS}
    return jwt.encode(claims, self._private_key, algorithm="RS256", headers={"kid": self._app_id})

  async def _request(self, method: str, path: str, *, params: dict[str, Any] | None = None, json: dict[str, Any] | None = None) -> dict[str, Any]:
    response = await self._http.request(method, f"{API_URL}{path}", params=params, json=json, headers={"Authorization": f"Bearer {self._token()}"})
    if response.is_success:
      return response.json() if response.content else {}
    try:
      body = response.json()
    except ValueError:
      body = {}
    code = body.get("error") if isinstance(body, dict) else None
    message = (body.get("message") if isinstance(body, dict) else None) or f"Enable Banking answered {response.status_code}"
    error = SessionGoneError if code in SESSION_GONE_ERRORS else EnableBankingError
    raise error(response.status_code, code, message)

  async def get_bank(self, name: str, country: str) -> Bank | None:
    body = await self._request("GET", "/aspsps", params={"country": country, "psu_type": "personal"})
    for aspsp in body.get("aspsps", []):
      if aspsp["name"] == name and aspsp["country"] == country:
        return Bank(name=aspsp["name"], country=aspsp["country"], maximum_consent_seconds=int(aspsp["maximum_consent_validity"]))
    return None

  async def start_authorization(self, bank: Bank, *, valid_until: datetime, redirect_url: str, state: str) -> str:
    """Returns the URL to send the user to, where they approve access with the bank (BankID for Swedish banks)."""
    body = await self._request(
      "POST",
      "/auth",
      json={
        "aspsp": {"name": bank.name, "country": bank.country},
        "access": {"valid_until": valid_until.isoformat()},
        "redirect_url": redirect_url,
        "state": state,
        "psu_type": "personal",
      },
    )
    return body["url"]

  async def create_session(self, code: str) -> Session:
    body = await self._request("POST", "/sessions", json={"code": code})
    return Session(
      session_id=body["session_id"],
      valid_until=datetime.fromisoformat(body["access"]["valid_until"]),
      accounts=[_account(a) for a in body.get("accounts", [])],
    )

  async def delete_session(self, session_id: str) -> None:
    await self._request("DELETE", f"/sessions/{session_id}")

  async def booked_transactions(self, account_uid: str, *, date_from: date) -> list[BookedTransaction]:
    """Every booked (not pending) transaction from `date_from`, following pagination to the end."""
    transactions: list[BookedTransaction] = []
    params: dict[str, Any] = {"date_from": date_from.isoformat(), "transaction_status": "BOOK"}
    while True:
      body = await self._request("GET", f"/accounts/{account_uid}/transactions", params=params)
      transactions.extend(_transaction(t) for t in body.get("transactions", []) if t.get("status", "BOOK") == "BOOK")
      continuation = body.get("continuation_key")
      if not continuation:
        return transactions
      params = {**params, "continuation_key": continuation}

  async def balance(self, account_uid: str) -> Decimal | None:
    """The account's booked balance as the bank reports it now, if it reports one."""
    body = await self._request("GET", f"/accounts/{account_uid}/balances")
    by_type = {b.get("balance_type"): b for b in body.get("balances", [])}
    for balance_type in BALANCE_TYPES:
      if balance_type in by_type:
        return Decimal(by_type[balance_type]["balance_amount"]["amount"])
    return None


def _account(account: dict[str, Any]) -> BankAccount:
  identification = account.get("account_id") or {}
  return BankAccount(
    uid=account["uid"],
    identification_hash=account["identification_hash"],
    # `name` is the account holder, never the account; `details` is what the bank calls it ("Sparkonto").
    name=account.get("details") or account.get("product"),
    iban=identification.get("iban"),
    currency=account.get("currency") or "SEK",
  )


def _transaction(transaction: dict[str, Any]) -> BookedTransaction:
  amount = transaction["transaction_amount"]
  credit = transaction.get("credit_debit_indicator") == "CRDT"
  counterparty = (transaction.get("debtor") if credit else transaction.get("creditor")) or {}
  remittance = " ".join(line.strip() for line in transaction.get("remittance_information") or [] if line and line.strip())
  booked = transaction.get("booking_date") or transaction.get("value_date") or transaction["transaction_date"]
  return BookedTransaction(
    reference=transaction.get("entry_reference") or transaction.get("transaction_id"),
    booking_date=date.fromisoformat(booked),
    amount=abs(Decimal(amount["amount"])),
    currency=amount["currency"],
    credit=credit,
    description=remittance or counterparty.get("name") or transaction.get("note") or "",
    code=(transaction.get("bank_transaction_code") or {}).get("code"),
    raw=transaction,
  )
