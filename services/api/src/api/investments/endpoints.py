from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Query

from api.avanza.repository import AvanzaAccountRepository, HoldingSnapshotRepository
from api.common.pagination import PaginationParamsQuery
from api.exceptions import ResourceNotFound, ServiceUnavailableError
from api.investments.repository import TradeRepository
from api.investments.schemas import CryptoPriceSchema, HoldingsResponse, TradeListResponse, TradeSchema
from api.investments.service import investment_service
from api.postgres import DBSession
from api.redis import Redis, get_redis
from api.users.dependencies import CurrentDBUser

COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price"
CRYPTO_PRICE_CACHE_TTL = 120

router = APIRouter(prefix="/investments", tags=["investments"])


# ─── Trades ───
# Read-only: trades come from a broker sync (Avanza), which would re-import any change.


@router.get("/trades", summary="List Trades", response_model=TradeListResponse)
async def list_trades(
  session: DBSession,
  current_user: CurrentDBUser,
  pagination: PaginationParamsQuery,
  security_id: Annotated[UUID | None, Query()] = None,
  bank_account_id: Annotated[UUID | None, Query()] = None,
) -> TradeListResponse:
  repo = TradeRepository.from_session(session)
  statement = repo.list_statement(current_user.id, security_id=security_id, bank_account_id=bank_account_id)
  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  return TradeListResponse.from_paginated_results(
    [
      TradeSchema.model_validate(
        {
          **{field: getattr(trade, field) for field in TradeSchema.model_fields if hasattr(trade, field)},
          "security_name": trade.security.name,
          "bank_account_name": trade.bank_account.name,
        }
      )
      for trade in items
    ],
    total_count,
    pagination,
  )


# ─── Holdings (computed) ───


@router.get("/holdings", summary="Get Holdings", response_model=HoldingsResponse)
async def get_holdings(
  session: DBSession,
  current_user: CurrentDBUser,
) -> HoldingsResponse:
  synced = await AvanzaAccountRepository.from_session(session).linked_bank_account_ids(current_user.id)
  snapshots = await HoldingSnapshotRepository.from_session(session).latest_for_accounts(synced)
  holdings = await investment_service.holdings(TradeRepository.from_session(session), current_user.id, synced_bank_account_ids=synced, snapshots=snapshots)
  return HoldingsResponse(items=holdings)


# ─── Crypto ───


@router.get("/crypto/price/{coin_id}", summary="Get Crypto Price", response_model=CryptoPriceSchema)
async def get_crypto_price(
  coin_id: str,
  redis: Annotated[Redis, Depends(get_redis)],
  current_user: CurrentDBUser,
  currency: str = Query(default="usd"),
) -> CryptoPriceSchema:
  cache_key = f"crypto_price:{coin_id}:{currency}"
  cached = await redis.get(cache_key)
  if cached is not None:
    return CryptoPriceSchema.model_validate_json(cached)

  async with httpx.AsyncClient(timeout=10.0) as http:
    try:
      response = await http.get(
        COINGECKO_URL,
        params={"ids": coin_id, "vs_currencies": currency, "include_24hr_change": "true"},
      )
    except httpx.RequestError as e:
      raise ServiceUnavailableError("Price data is unavailable right now.", status_code=502) from e

  if response.status_code != 200:
    raise ServiceUnavailableError(
      f"CoinGecko returned {response.status_code}",
      status_code=429 if response.status_code == 429 else 502,
    )

  data = response.json()
  if coin_id not in data or currency not in data[coin_id]:
    raise ResourceNotFound(f"Coin '{coin_id}' not found on CoinGecko")

  coin_data = data[coin_id]
  result = CryptoPriceSchema(
    coin_id=coin_id,
    currency=currency,
    price=coin_data[currency],
    price_change_pct_24h=coin_data.get(f"{currency}_24h_change"),
  )
  await redis.set(cache_key, result.model_dump_json(), ex=CRYPTO_PRICE_CACHE_TTL)
  return result
