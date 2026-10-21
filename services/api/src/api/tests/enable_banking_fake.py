"""An in-memory Enable Banking API, served over httpx.MockTransport, that checks every request's signed JWT."""

import json
import re
from dataclasses import dataclass, field
from datetime import date
from itertools import count
from typing import Any

import httpx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import JWTError, jwt

APP_ID = "test-app-id"
_TRANSACTIONS = re.compile(r"^/accounts/(?P<uid>[^/]+)/transactions$")
_SESSION = re.compile(r"^/sessions/(?P<session_id>[^/]+)$")


def generate_key() -> tuple[str, str]:
  """A throwaway RSA key pair as (private PEM, public PEM)."""
  key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
  private = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
  public = key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
  return private, public


def account(uid: str, identification_hash: str, *, iban: str = "SE4591500000000000001234", name: str = "Allkonto") -> dict[str, Any]:
  return {"uid": uid, "identification_hash": identification_hash, "name": name, "account_id": {"iban": iban}, "currency": "SEK"}


def transaction(
  reference: str | None,
  booked: date,
  amount: str,
  *,
  credit: bool = False,
  text: str = "ICA Kvantum",
  status: str = "BOOK",
) -> dict[str, Any]:
  return {
    "entry_reference": reference,
    "booking_date": booked.isoformat(),
    "transaction_amount": {"amount": amount, "currency": "SEK"},
    "credit_debit_indicator": "CRDT" if credit else "DBIT",
    "remittance_information": [text],
    "status": status,
  }


@dataclass
class FakeEnableBanking:
  public_key: str
  # Code the bank redirect hands back -> (valid_until, accounts) of the session it creates.
  approvals: dict[str, tuple[str, list[dict[str, Any]]]] = field(default_factory=dict)
  # Account uid -> every transaction the bank has for it.
  transactions: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
  # Account uids whose session the bank considers expired.
  expired: set[str] = field(default_factory=set)
  page_size: int = 2
  # Some banks return more than asked for: older days, or pending transactions.
  ignores_filters: bool = False
  auth_requests: list[dict[str, Any]] = field(default_factory=list)
  transaction_requests: list[dict[str, str]] = field(default_factory=list)
  deleted_sessions: list[str] = field(default_factory=list)
  _ids: count = field(default_factory=lambda: count(1))

  def transport(self) -> httpx.MockTransport:
    return httpx.MockTransport(self._handle)

  def _handle(self, request: httpx.Request) -> httpx.Response:
    token = request.headers.get("authorization", "").removeprefix("Bearer ")
    try:
      if jwt.get_unverified_header(token).get("kid") != APP_ID:
        raise JWTError("wrong kid")
      jwt.decode(token, self.public_key, algorithms=["RS256"], audience="api.enablebanking.com", issuer="enablebanking.com")
    except JWTError:
      return httpx.Response(401, json={"error": "UNAUTHORIZED", "message": "Invalid token"})

    path = request.url.path
    if request.method == "GET" and path == "/aspsps":
      return httpx.Response(
        200,
        json={
          "aspsps": [
            {"name": "Nordea", "country": "SE", "maximum_consent_validity": 7776000},
            {"name": "Skandia", "country": "SE", "maximum_consent_validity": 15552000},
            {"name": "Mock ASPSP", "country": "SE", "maximum_consent_validity": 864000},
          ]
        },
      )
    if request.method == "POST" and path == "/auth":
      body = json.loads(request.content)
      self.auth_requests.append(body)
      return httpx.Response(200, json={"url": "https://tilisy.example/authorize?id=1", "authorization_id": "1"})
    if request.method == "POST" and path == "/sessions":
      code = json.loads(request.content)["code"]
      if code not in self.approvals:
        return httpx.Response(422, json={"error": "EXPIRED_AUTHORIZATION_CODE", "message": "Authorization code is expired"})
      valid_until, accounts = self.approvals.pop(code)
      return httpx.Response(200, json={"session_id": f"session-{next(self._ids)}", "accounts": accounts, "access": {"valid_until": valid_until}})
    if request.method == "DELETE" and (match := _SESSION.match(path)):
      self.deleted_sessions.append(match["session_id"])
      return httpx.Response(200, json={"message": "OK"})
    if request.method == "GET" and (match := _TRANSACTIONS.match(path)):
      return self._transactions(match["uid"], dict(request.url.params))
    return httpx.Response(404, json={"error": "NOT_FOUND", "message": path})

  def _transactions(self, uid: str, params: dict[str, str]) -> httpx.Response:
    self.transaction_requests.append({"uid": uid, **params})
    if uid in self.expired:
      return httpx.Response(401, json={"error": "EXPIRED_SESSION", "message": "Session is expired"})
    if uid not in self.transactions:
      return httpx.Response(404, json={"error": "ACCOUNT_DOES_NOT_EXIST", "message": uid})
    status = params.get("transaction_status")
    matching = [
      t for t in self.transactions[uid] if self.ignores_filters or (t["booking_date"] >= params["date_from"] and (status is None or t["status"] == status))
    ]
    start = int(params.get("continuation_key", "0"))
    page = matching[start : start + self.page_size]
    more = start + self.page_size < len(matching)
    return httpx.Response(200, json={"transactions": page, "continuation_key": str(start + self.page_size) if more else None})
