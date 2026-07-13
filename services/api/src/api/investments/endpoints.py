from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Query

from api.bank_accounts.repository import BankAccountRepository
from api.common.pagination import PaginationParamsQuery
from api.exceptions import ConflictError, ResourceNotFound, ServiceUnavailableError
from api.investments.repository import SecurityPriceRepository, SecurityRepository, TradeRepository
from api.investments.schemas import (
  CryptoPriceSchema,
  HoldingSchema,
  HoldingsResponse,
  SecurityCreate,
  SecurityListResponse,
  SecurityPriceCreate,
  SecurityPriceListResponse,
  SecurityPriceSchema,
  SecuritySchema,
  SecurityUpdate,
  TradeCreate,
  TradeListResponse,
  TradeSchema,
  TradeUpdate,
)
from api.models.security import Security
from api.models.security_price import SecurityPrice
from api.models.trade import Trade
from api.postgres import AsyncSession, get_db_session
from api.redis import Redis, get_redis
from api.users.dependencies import CurrentDBUser

COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price"
CRYPTO_PRICE_CACHE_TTL = 120

router = APIRouter(prefix="/investments", tags=["investments"])


# ─── Securities ───


@router.get("/securities", summary="List Securities", response_model=SecurityListResponse)
async def list_securities(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  pagination: PaginationParamsQuery,
) -> SecurityListResponse:
  repo = SecurityRepository.from_session(session)
  statement = repo.get_base_statement().order_by(Security.name.asc())
  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  return SecurityListResponse.from_paginated_results(
    [SecuritySchema.model_validate(item) for item in items],
    total_count,
    pagination,
  )


@router.post("/securities", summary="Create Security", response_model=SecuritySchema, status_code=201)
async def create_security(
  body: SecurityCreate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> SecuritySchema:
  repo = SecurityRepository.from_session(session)
  security = Security(**body.model_dump())
  await repo.create(security, flush=True)
  return SecuritySchema.model_validate(security)


@router.patch("/securities/{security_id}", summary="Update Security", response_model=SecuritySchema)
async def update_security(
  security_id: UUID,
  body: SecurityUpdate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> SecuritySchema:
  repo = SecurityRepository.from_session(session)
  security = await repo.get_by_id(security_id)
  if security is None:
    raise ResourceNotFound("Security not found")
  update_dict = body.model_dump(exclude_unset=True)
  if update_dict:
    await repo.update(security, update_dict=update_dict)
  return SecuritySchema.model_validate(security)


@router.delete("/securities/{security_id}", summary="Delete Security", status_code=204)
async def delete_security(
  security_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> None:
  repo = SecurityRepository.from_session(session)
  security = await repo.get_by_id(security_id)
  if security is None:
    raise ResourceNotFound("Security not found")
  # Securities are shared; deleting cascades to trades and prices, so never
  # allow one user to wipe rows belonging to someone else.
  trade_repo = TradeRepository.from_session(session)
  if await trade_repo.count_for_security_by_other_users(security_id, current_user.id) > 0:
    raise ConflictError("Security has trades belonging to other users")
  await repo.delete(security)


# ─── Trades ───


@router.get("/trades", summary="List Trades", response_model=TradeListResponse)
async def list_trades(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  pagination: PaginationParamsQuery,
  security_id: Annotated[UUID | None, Query()] = None,
  bank_account_id: Annotated[UUID | None, Query()] = None,
) -> TradeListResponse:
  repo = TradeRepository.from_session(session)
  statement = repo.get_base_statement().where(Trade.user_id == current_user.id).order_by(Trade.trade_date.desc(), Trade.created_at.desc())
  if security_id is not None:
    statement = statement.where(Trade.security_id == security_id)
  if bank_account_id is not None:
    statement = statement.where(Trade.bank_account_id == bank_account_id)
  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  return TradeListResponse.from_paginated_results(
    [TradeSchema.model_validate(item) for item in items],
    total_count,
    pagination,
  )


@router.post("/trades", summary="Create Trade", response_model=TradeSchema, status_code=201)
async def create_trade(
  body: TradeCreate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> TradeSchema:
  sec_repo = SecurityRepository.from_session(session)
  if await sec_repo.get_by_id(body.security_id) is None:
    raise ResourceNotFound("Security not found")
  bank_account = await BankAccountRepository.from_session(session).get_by_id(body.bank_account_id)
  if bank_account is None or bank_account.user_id != current_user.id:
    raise ResourceNotFound("Bank account not found")
  repo = TradeRepository.from_session(session)
  trade = Trade(**body.model_dump(), user_id=current_user.id)
  await repo.create(trade, flush=True)
  return TradeSchema.model_validate(trade)


@router.patch("/trades/{trade_id}", summary="Update Trade", response_model=TradeSchema)
async def update_trade(
  trade_id: UUID,
  body: TradeUpdate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> TradeSchema:
  repo = TradeRepository.from_session(session)
  trade = await repo.get_by_id(trade_id)
  if trade is None or trade.user_id != current_user.id:
    raise ResourceNotFound("Trade not found")
  update_dict = body.model_dump(exclude_unset=True)
  if update_dict:
    await repo.update(trade, update_dict=update_dict)
  return TradeSchema.model_validate(trade)


@router.delete("/trades/{trade_id}", summary="Delete Trade", status_code=204)
async def delete_trade(
  trade_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> None:
  repo = TradeRepository.from_session(session)
  trade = await repo.get_by_id(trade_id)
  if trade is None or trade.user_id != current_user.id:
    raise ResourceNotFound("Trade not found")
  await repo.delete(trade)


# ─── Prices ───


@router.get("/securities/{security_id}/prices", summary="List Security Prices", response_model=SecurityPriceListResponse)
async def list_security_prices(
  security_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  pagination: PaginationParamsQuery,
) -> SecurityPriceListResponse:
  repo = SecurityPriceRepository.from_session(session)
  statement = repo.get_base_statement().where(SecurityPrice.security_id == security_id).order_by(SecurityPrice.price_date.desc())
  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  return SecurityPriceListResponse.from_paginated_results(
    [SecurityPriceSchema.model_validate(item) for item in items],
    total_count,
    pagination,
  )


@router.post(
  "/securities/{security_id}/prices",
  summary="Add Security Price",
  response_model=SecurityPriceSchema,
  status_code=201,
)
async def create_security_price(
  security_id: UUID,
  body: SecurityPriceCreate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> SecurityPriceSchema:
  sec_repo = SecurityRepository.from_session(session)
  if await sec_repo.get_by_id(security_id) is None:
    raise ResourceNotFound("Security not found")
  repo = SecurityPriceRepository.from_session(session)
  price = SecurityPrice(security_id=security_id, **body.model_dump())
  await repo.create(price, flush=True)
  return SecurityPriceSchema.model_validate(price)


# ─── Holdings (computed) ───


@router.get("/holdings", summary="Get Holdings", response_model=HoldingsResponse)
async def get_holdings(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> HoldingsResponse:
  repo = TradeRepository.from_session(session)
  rows = await repo.holdings_rows(current_user.id)
  holdings: list[HoldingSchema] = []

  for row in rows:
    net_qty = int(row.net_quantity)
    total_buy_qty = int(row.total_buy_qty)
    total_buy_cost = int(row.total_buy_cost)

    avg_cost = total_buy_cost // total_buy_qty if total_buy_qty > 0 else 0
    cost_basis = (net_qty * avg_cost) // 1_000_000

    current_price = int(row.current_price) if row.current_price is not None else None
    current_value = (net_qty * current_price) // 1_000_000 if current_price is not None else None
    gain_loss = current_value - cost_basis if current_value is not None else None
    gain_loss_pct = round(gain_loss / cost_basis * 100, 2) if gain_loss is not None and cost_basis > 0 else None

    holdings.append(
      HoldingSchema(
        security_id=row.id,
        security_name=row.name,
        ticker=row.ticker,
        asset_type=row.asset_type,
        currency=row.currency,
        quantity=net_qty,
        avg_cost_per_unit=avg_cost,
        cost_basis=cost_basis,
        current_price=current_price,
        current_value=current_value,
        gain_loss=gain_loss,
        gain_loss_pct=gain_loss_pct,
      )
    )

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
      raise ServiceUnavailableError(f"Failed to reach CoinGecko: {e}", status_code=502) from e

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
