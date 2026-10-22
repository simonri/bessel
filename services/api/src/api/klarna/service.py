import hashlib
import json
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import date
from typing import Any
from uuid import UUID

import httpx
from api.common.db.postgres import AsyncSession
from api.exceptions import ServiceUnavailableError, ValidationError
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


def is_pay_later(item: dict[str, Any]) -> bool:
  """Anything not paid at purchase, including plans Klarna adds later: a missed purchase is worse than an odd one."""
  item_plan = plan(item)
  return item_plan is not None and item_plan.lower() not in PAID_AT_PURCHASE


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
  dedup_hash = hashlib.sha256(f"klarna:{unique_id}".encode()).hexdigest()

  return ParsedTransaction(
    transaction_date=tx_date,
    amount_minor=amount_minor,
    currency=currency,
    direction=direction,
    dedup_hash=dedup_hash,
    description=title,
    raw_data=item,
  )


@dataclass(frozen=True, slots=True)
class PayLaterImport:
  created: int
  updated: int
  paid_at_purchase: int
  unrecognized_plans: list[str] = field(default_factory=list)


async def import_pay_later(session: AsyncSession, *, user_id: UUID, bank_account_id: UUID, items: list[dict[str, Any]]) -> PayLaterImport:
  """Imports the purchases Klarna lets the user pay later, and brings earlier ones up to date after returns."""
  pay_later = [item for item in items if is_pay_later(item)]
  parsed = [p for item in pay_later if (p := map_to_parsed(item)) is not None]
  created, _ = await transaction_service.import_transactions(
    session,
    bank_account_id=bank_account_id,
    bank_name="klarna",
    file_format="klarna_api",
    raw_content=json.dumps([p.raw_data for p in parsed]),
    parsed=parsed,
    user_id=user_id,
  )
  updated = await TransactionRepository.from_session(session).update_amounts(
    user_id, bank_account_id, {p.dedup_hash: (p.amount_minor, p.direction) for p in parsed}
  )
  unrecognized = sorted({item_plan for item in pay_later if (item_plan := plan(item)) and not PAY_LATER_PLANS.match(item_plan)})
  return PayLaterImport(created=created, updated=updated, paid_at_purchase=len(items) - len(pay_later), unrecognized_plans=unrecognized)
