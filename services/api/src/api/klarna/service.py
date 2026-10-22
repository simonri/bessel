import hashlib
import json
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any
from uuid import UUID

import httpx
from api.bank_accounts.repository import BankAccountRepository
from api.common.db.postgres import AsyncSession
from api.exceptions import ServiceUnavailableError, ValidationError
from api.klarna.repository import KlarnaPayLaterRepository
from api.models.klarna import KlarnaPayLater
from api.models.transaction import TransactionDirection
from api.transactions.parsers.base import ParsedTransaction
from api.transactions.repository import TransactionRepository
from api.transactions.service import transaction_service

# Plans paid at purchase: the money already shows in a bank account, on a card or in the
# Klarna balance (synced through Enable Banking), so importing them would count it twice.
PAID_AT_PURCHASE = frozenset({"pay in full", "pay now", "pay by card", "swish", "imported from gmail"})
PAY_LATER_PLANS = re.compile(r"^(pay in \d+ days|pay later|pay over \d+ months|pay in \d+( (instal+ments|parts))?|financing)$", re.IGNORECASE)
_CLOCK = re.compile(r"^\d{1,2}:\d{2}$")

KLARNA_URL = "https://app.klarna.com/se/api/post_purchase_bff/post-purchase/feature/graphql"
PAYMENTS_URL = "https://app.klarna.com/se/api/post_purchase_bff/post-purchase/feature/manage-payments/v1"
# Completed payments of what was bought to pay later: "pay-later" invoices, and "account" statements.
PAID_LATER_KINDS = frozenset({"pay-later", "account"})

GRAPHQL_QUERY = """
query transactionList_allList(
  $filter: TransactionFilter
  $prependFilter: TransactionFilter
  $page: PageArgs!
  $transactionKrns: [ID!]
  $context: Context!
  $lastCreatedAt: String
) {
  transactionsList(
    filter: $filter
    page: $page
    transactionKrns: $transactionKrns
    context: $context
    prependFilter: $prependFilter
    lastCreatedAt: $lastCreatedAt
  ) {
    __typename
    items {
      ...transactionStateV2MasterOutput
      ... on TransactionStateV2MasterOutput {
        groupHeader { ...groupHeader }
        label { ...label }
      }
    }
    paginationToken
  }
}

fragment label on TransactionStateV2Label {
  text backgroundColorToken
}
fragment groupHeader on TransactionStateGroupHeader {
  colorToken headerKey text textToken
}
fragment transactionStateV2MasterOutput on TransactionStateV2MasterOutput {
  __typename title uniqueId transactionKrn captureKrn isPending createdAt
  rootCreatedAt disputeId
  avatar { ...avatar }
  subtitle { ...subtitle }
  amount { ...amount }
  buttonsV2 { ...button }
  secondaryButtons { ...button }
  staticMapV2 { ...staticMapV2 }
}
fragment subtitle on TransactionStateV2Subtitle {
  cardValue colorToken icon
  remoteIcon { url fallbackCharacter size hasBorder backgroundColorToken }
  text textToken
}
fragment avatar on TransactionStateV2Avatar {
  logoUrl { url x1 { url } x2 { url } x3 { url } }
  fallbackCharacter backgroundImages { name images { url format } }
  lineItemsCount klarnaCardId oneCardKrn iconSize avatarType
}
fragment staticMapV2 on TransactionStateStaticMap {
  trackingId carrier { logo name slug }
  origin
  checkpoint { id coordinates { longitude latitude } type }
  deliveryStatus
}
fragment amount on TransactionStateV2Amount {
  __typename amount spanAmount secondAmount currentAmount originalAmount
  isAmountLineThrough isSecondAmountLineThrough hasPlus amountColorToken
  amountTextToken currency amountText amountTextColor
  countdown { ...countdown }
}
fragment countdown on TransactionStateCountdown { to template }
fragment button on TransactionStateActionButton {
  key props { text serializedPayload variant }
}
"""
# Where Klarna serves merchants' logos; its own app icons live elsewhere (x.klarnacdn.net/klapp).
MERCHANT_LOGOS = "https://assets.klarnacdn.net/"


def _cookie_value(cookie_str: str, key: str) -> str | None:
  """Extract a single cookie value from a Cookie header string."""
  for part in cookie_str.split(";"):
    k, _, v = part.strip().partition("=")
    if k.strip() == key:
      return v.strip()
  return None


def _build_klarna_headers(authorization: str, cookie: str | None) -> dict[str, str]:
  session_id = _cookie_value(cookie, "sessionId") if cookie else None
  device_id = _cookie_value(cookie, "kdid") if cookie else None
  headers: dict[str, str] = {
    "Authorization": authorization,
    "Content-Type": "application/json",
    "Accept": "*/*",
    "Origin": "https://app.klarna.com",
    "Referer": "https://app.klarna.com/manage-payments/one-tab-purchases",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    "x-klarna-app-client": "klapp",
    "x-klarna-app-platform": "web",
    "x-klarna-market": "SE",
    "x-klarna-client-flavor": "pink",
    "x-klarna-client-target": "app",
    "x-klarna-app-locale": "en-SE",
    "x-klarna-app-ppe": "false",
    "x-klarna-app-release": "26.21.113+13",
    "x-klarna-app-version": "92dff7c76a2",
    "x-klarna-app-timezone": "Europe/Stockholm",
    "x-klarna-advertising-consent": "false",
    "klarna-correlation-id": str(uuid.uuid4()),
    "x-started-at": str(int(time.time() * 1000)),
  }
  if cookie:
    headers["Cookie"] = cookie
  if session_id:
    headers["x-klarna-app-session-id"] = session_id
  if device_id:
    headers["x-klarna-app-device-id"] = device_id
  return headers


async def fetch_klarna_items(
  authorization: str,
  cookie: str | None,
  max_pages: int = 20,
) -> list[dict[str, Any]]:
  """Fetch all transaction items from Klarna, paginating up to max_pages."""
  headers = _build_klarna_headers(authorization, cookie)
  all_items: list[dict[str, Any]] = []
  pagination_token: int | None = 0

  async with httpx.AsyncClient(timeout=15.0) as http:
    for _ in range(max_pages):
      if pagination_token is None:
        break

      payload = {
        "query": GRAPHQL_QUERY,
        "variables": {
          "page": {"token": pagination_token, "limit": 100},
          "filter": {"filterName": "internalCaptured"},
          "prependFilter": {"filterName": "unCaptured"},
          "context": "DEFAULT",
        },
      }

      try:
        response = await http.post(KLARNA_URL, json=payload, headers=headers)
      except httpx.RequestError as e:
        raise ServiceUnavailableError("Klarna is unavailable right now.", status_code=502) from e

      if response.status_code != 200:
        raise ServiceUnavailableError(
          f"Klarna returned {response.status_code}: {response.text[:500]}",
          status_code=response.status_code,
        )

      data = response.json()
      if "errors" in data:
        raise ValidationError(f"Klarna GraphQL errors: {data['errors']}")

      result = data.get("data", {}).get("transactionsList", {})
      items = result.get("items", [])
      all_items.extend(items)
      pagination_token = result.get("paginationToken")

  return all_items


def plan(item: dict[str, Any]) -> str | None:
  """How the purchase is paid, as Klarna's app shows it under the merchant ("Pay in 30 days")."""
  subtitle = item.get("subtitle") or []
  for part in subtitle if isinstance(subtitle, list) else [subtitle]:
    text = (part or {}).get("text")
    if text and not _CLOCK.match(text):
      return text
  return None


def declined(item: dict[str, Any]) -> bool:
  """A card payment Klarna refused ("Insufficient balance", "Frozen card"); no money moved."""
  return (item.get("avatar") or {}).get("avatarType") == "REJECTED_CARD"


def cancelled(item: dict[str, Any]) -> bool:
  """A purchase Klarna struck through after it went ahead, so nothing is owed for it any more."""
  return bool((item.get("amount") or {}).get("isAmountLineThrough"))


def dedup_hash(unique_id: str) -> str:
  return hashlib.sha256(f"klarna:{unique_id}".encode()).hexdigest()


def is_pay_later(item: dict[str, Any]) -> bool:
  """Anything not paid at purchase, including plans Klarna adds later: a missed purchase is worse than an odd one."""
  item_plan = plan(item)
  return item_plan is not None and item_plan.lower() not in PAID_AT_PURCHASE


def merchant_logo(item: dict[str, Any]) -> str | None:
  """The merchant's logo on Klarna's image CDN; a Klarna card purchase shows Klarna's own card icon instead, which isn't one."""
  avatar_logo = ((item.get("avatar") or {}).get("logoUrl") or {}).get("x2") or {}
  icon = (((item.get("icon") or {}).get("value") or {}).get("icon") or {}).get("value") or {}
  for url in (avatar_logo.get("url"), icon.get("url") if isinstance(icon, dict) else None):
    if isinstance(url, str) and url.startswith(MERCHANT_LOGOS) and "/image/" in url:
      return url
  return None


def map_to_parsed(item: dict[str, Any]) -> ParsedTransaction | None:
  """Map a single Klarna item to ParsedTransaction. Returns None if the item should be skipped."""
  # Skip rejected/failed authorisations — these never settled
  amount = item.get("amount") or {}
  if amount.get("isAmountLineThrough"):
    return None
  if item.get("isPending"):
    return None
  avatar = item.get("avatar") or {}
  if avatar.get("avatarType") == "REJECTED_CARD":
    return None

  # What is still owed after returns; Klarna lowers it in place, and can take it below zero.
  amount_minor: int | None = amount.get("currentAmount")
  currency: str | None = amount.get("currency")
  unique_id: str | None = item.get("uniqueId")
  created_at: str | None = item.get("createdAt")
  title: str = item.get("title") or "Unknown"

  if amount_minor is None or not currency or not unique_id or not created_at:
    return None

  tx_date = date.fromisoformat(created_at[:10])
  credit = bool(amount.get("hasPlus")) != (amount_minor < 0)
  direction = TransactionDirection.credit if credit else TransactionDirection.debit
  amount_minor = abs(amount_minor)

  return ParsedTransaction(
    transaction_date=tx_date,
    amount_minor=amount_minor,
    currency=currency,
    direction=direction,
    dedup_hash=dedup_hash(unique_id),
    description=title,
    raw_data=item,
    logo_url=merchant_logo(item),
  )


@dataclass(frozen=True, slots=True)
class KlarnaPayments:
  """What Klarna's payments page shows: what's left to pay, and the payments made."""

  owed: int
  completed: list[dict[str, Any]]


async def fetch_klarna_payments(authorization: str, cookie: str | None) -> KlarnaPayments:
  headers = _build_klarna_headers(authorization, cookie)
  async with httpx.AsyncClient(timeout=15.0) as http:
    try:
      active = await http.get(f"{PAYMENTS_URL}/active", headers=headers)
      completed = await http.post(f"{PAYMENTS_URL}/completed", headers=headers)
    except httpx.RequestError as e:
      raise ServiceUnavailableError("Klarna is unavailable right now.", status_code=502) from e
  for response in (active, completed):
    if response.status_code != 200:
      raise ServiceUnavailableError(f"Klarna returned {response.status_code}: {response.text[:500]}", status_code=response.status_code)
  owed = int(active.json()["data"]["metadata"]["amounts"]["total_you_owe"]["amount"])
  return KlarnaPayments(owed=owed, completed=completed.json()["data"].get("payment_items") or [])


def payment_to_parsed(item: dict[str, Any]) -> ParsedTransaction | None:
  """A completed payment of a pay later purchase, as money into the pay later account."""
  metadata = item.get("metadata") or {}
  unique_id: str = metadata.get("unique_id") or ""
  parts = unique_id.split(":")
  amount = metadata.get("amount") or {}
  if len(parts) < 2 or parts[1] not in PAID_LATER_KINDS or metadata.get("section_id") == "completed-subsection-in-progress":
    return None
  if not amount.get("amount") or not amount.get("currency") or not metadata.get("calendar_date"):
    return None
  title = (item.get("title") or {}).get("value") or "Klarna"
  return ParsedTransaction(
    transaction_date=date.fromisoformat(metadata["calendar_date"]),
    amount_minor=int(amount["amount"]),
    currency=amount["currency"],
    direction=TransactionDirection.credit,
    dedup_hash=hashlib.sha256(f"klarna-payment:{unique_id}".encode()).hexdigest(),
    description=f"Payment for {title}",
    raw_data=item,
    logo_url=merchant_logo(item),
  )


@dataclass(frozen=True, slots=True)
class PayLaterImport:
  created: int
  updated: int
  paid_at_purchase: int
  declined: int
  payments: int
  owed: int | None
  # What Bessel owes minus what Klarna says is owed; anything but 0 means a purchase or payment is missing.
  drift: int | None
  unrecognized_plans: list[str] = field(default_factory=list)


async def _reconcile(session: AsyncSession, state: KlarnaPayLater, owed: int, *, now: datetime) -> int:
  """Compares the account with what Klarna says is owed; the first time sets its starting balance to match."""
  bank_account = await BankAccountRepository.from_session(session).get_by_id(state.bank_account_id)
  assert bank_account is not None
  net = (await TransactionRepository.from_session(session).net_balances_by_account([bank_account.id])).get(bank_account.id, 0)
  # Older payments, such as statements from before Klarna's list starts, aren't in Bessel: the anchor covers them.
  if state.balance_anchored_at is None:
    bank_account.base_balance = -owed - net
    state.balance_anchored_at = now
  drift = -(bank_account.base_balance + net) - owed
  state.owed, state.balance_drift = owed, drift
  return drift


async def import_pay_later(
  session: AsyncSession,
  *,
  user_id: UUID,
  bank_account_id: UUID,
  items: list[dict[str, Any]],
  payments: KlarnaPayments | None = None,
  now: datetime,
) -> PayLaterImport:
  """Imports the purchases Klarna lets the user pay later and their payments, and checks the result against what Klarna says is owed."""
  refused = [item for item in items if declined(item)]
  pay_later = [item for item in items if not declined(item) and is_pay_later(item)]
  parsed = [p for item in pay_later if (p := map_to_parsed(item)) is not None]
  paid = [p for item in (payments.completed if payments else []) if (p := payment_to_parsed(item)) is not None]
  # Cancelled after an earlier import: the row stays, owing nothing.
  struck = {dedup_hash(item["uniqueId"]): (0, TransactionDirection.debit) for item in pay_later if cancelled(item) and item.get("uniqueId")}
  created, payments_created = [
    (
      await transaction_service.import_transactions(
        session,
        bank_account_id=bank_account_id,
        bank_name="klarna",
        file_format="klarna_api",
        raw_content=json.dumps([p.raw_data for p in rows]),
        parsed=rows,
        user_id=user_id,
      )
    )[0]
    for rows in (parsed, paid)
  ]
  updated = await TransactionRepository.from_session(session).update_amounts(
    user_id, bank_account_id, {**struck, **{p.dedup_hash: (p.amount_minor, p.direction) for p in parsed}}
  )
  repository = KlarnaPayLaterRepository.from_session(session)
  state = await repository.get_for_account(bank_account_id)
  if state is None:
    state = await repository.create(KlarnaPayLater(user_id=user_id, bank_account_id=bank_account_id), flush=True)
  state.last_imported_at, state.stale_notified_at = now, None
  drift = await _reconcile(session, state, payments.owed, now=now) if payments else None
  await session.flush()
  unrecognized = sorted({item_plan for item in pay_later if (item_plan := plan(item)) and not PAY_LATER_PLANS.match(item_plan)})
  return PayLaterImport(
    created=created,
    updated=updated,
    paid_at_purchase=len(items) - len(pay_later) - len(refused),
    declined=len(refused),
    payments=payments_created,
    owed=payments.owed if payments else None,
    drift=drift,
    unrecognized_plans=unrecognized,
  )
