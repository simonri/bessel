import hashlib
import time
import uuid
from datetime import date
from typing import Annotated, Any
from uuid import UUID

import httpx
from fastapi import APIRouter, Header, HTTPException

from api.models.transaction import TransactionDirection
from api.postgres import AsyncSession, get_db_session
from api.transactions.parsers.base import ParsedTransaction
from api.transactions.service import transaction_service
from api.transactions.schemas import ImportResponse

router = APIRouter(prefix="/klarna", tags=["klarna"])

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


async def _fetch_klarna_items(
  authorization: str,
  cookie: str | None,
  max_pages: int = 5,
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
        raise HTTPException(status_code=502, detail=f"Failed to reach Klarna: {e}") from e

      if response.status_code != 200:
        raise HTTPException(
          status_code=response.status_code,
          detail=f"Klarna returned {response.status_code}: {response.text[:500]}",
        )

      data = response.json()
      if "errors" in data:
        raise HTTPException(status_code=400, detail=data["errors"])

      result = data.get("data", {}).get("transactionsList", {})
      items = result.get("items", [])
      all_items.extend(items)
      pagination_token = result.get("paginationToken")

  return all_items


def _map_to_parsed(item: dict[str, Any]) -> ParsedTransaction | None:
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

  amount_minor: int | None = amount.get("currentAmount")
  currency: str | None = amount.get("currency")
  unique_id: str | None = item.get("uniqueId")
  created_at: str | None = item.get("createdAt")
  title: str = item.get("title") or "Unknown"

  if not amount_minor or not currency or not unique_id or not created_at:
    return None

  tx_date = date.fromisoformat(created_at[:10])
  direction = TransactionDirection.credit if amount.get("hasPlus") else TransactionDirection.debit
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


from pydantic import UUID4  # noqa: E402
from fastapi import Depends  # noqa: E402
from api.common.schemas import Schema  # noqa: E402


class KlarnaImportRequest(Schema):
  bank_account_id: UUID4
  authorization: str
  cookie: str | None = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/transactions")
async def get_klarna_transactions(
  authorization: Annotated[str, Header(description="Klarna Bearer token")],
  cookie: Annotated[str | None, Header(description="Klarna session cookies")] = None,
) -> dict[str, Any]:
  """Fetch Klarna transactions and return raw GraphQL response."""
  if not authorization.lower().startswith("bearer "):
    raise HTTPException(status_code=400, detail="Authorization header must be a Bearer token")

  items = await _fetch_klarna_items(authorization, cookie)
  return {"data": {"transactionsList": {"items": items}}}


@router.post("/import", response_model=ImportResponse)
async def import_klarna_transactions(
  body: KlarnaImportRequest,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ImportResponse:
  """
  Fetch Klarna transactions and import them into Metron.
  Skips rejected (isAmountLineThrough), pending, and duplicate transactions.
  """
  auth = body.authorization
  if not auth.lower().startswith("bearer "):
    raise HTTPException(status_code=400, detail="Authorization must be a Bearer token")

  items = await _fetch_klarna_items(auth, body.cookie)
  parsed = [p for item in items if (p := _map_to_parsed(item)) is not None]

  created, skipped = await transaction_service.import_transactions(
    session,
    bank_account_id=body.bank_account_id,
    bank_name="klarna",
    file_format="klarna_api",
    raw_content=f"[klarna api, {len(items)} items fetched]",
    parsed=parsed,
  )

  return ImportResponse(created=created, skipped=skipped)
