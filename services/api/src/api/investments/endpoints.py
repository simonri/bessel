from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select

from api.common.pagination import PaginationParamsQuery
from api.exceptions import ResourceNotFound
from api.investments.repository import SecurityPriceRepository, SecurityRepository, TradeRepository
from api.investments.schemas import (
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
from api.models.trade import Trade, TradeType
from api.postgres import AsyncSession, get_db_session

router = APIRouter(prefix="/investments", tags=["investments"])


# ─── Securities ───


@router.get("/securities", summary="List Securities", response_model=SecurityListResponse)
async def list_securities(
  session: Annotated[AsyncSession, Depends(get_db_session)],
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
) -> None:
  repo = SecurityRepository.from_session(session)
  security = await repo.get_by_id(security_id)
  if security is None:
    raise ResourceNotFound("Security not found")
  await session.delete(security)


# ─── Trades ───


@router.get("/trades", summary="List Trades", response_model=TradeListResponse)
async def list_trades(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  pagination: PaginationParamsQuery,
  security_id: UUID | None = Query(default=None),
  bank_account_id: UUID | None = Query(default=None),
) -> TradeListResponse:
  repo = TradeRepository.from_session(session)
  statement = repo.get_base_statement().order_by(Trade.trade_date.desc(), Trade.created_at.desc())
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
) -> TradeSchema:
  # Verify security exists
  sec_repo = SecurityRepository.from_session(session)
  if await sec_repo.get_by_id(body.security_id) is None:
    raise ResourceNotFound("Security not found")
  repo = TradeRepository.from_session(session)
  trade = Trade(**body.model_dump())
  await repo.create(trade, flush=True)
  return TradeSchema.model_validate(trade)


@router.patch("/trades/{trade_id}", summary="Update Trade", response_model=TradeSchema)
async def update_trade(
  trade_id: UUID,
  body: TradeUpdate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> TradeSchema:
  repo = TradeRepository.from_session(session)
  trade = await repo.get_by_id(trade_id)
  if trade is None:
    raise ResourceNotFound("Trade not found")
  update_dict = body.model_dump(exclude_unset=True)
  if update_dict:
    await repo.update(trade, update_dict=update_dict)
  return TradeSchema.model_validate(trade)


@router.delete("/trades/{trade_id}", summary="Delete Trade", status_code=204)
async def delete_trade(
  trade_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
  repo = TradeRepository.from_session(session)
  trade = await repo.get_by_id(trade_id)
  if trade is None:
    raise ResourceNotFound("Trade not found")
  await session.delete(trade)


# ─── Prices ───


@router.get("/securities/{security_id}/prices", summary="List Security Prices", response_model=SecurityPriceListResponse)
async def list_security_prices(
  security_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
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
) -> HoldingsResponse:
  # Aggregate trades per security: net quantity, total buy cost, total buy quantity
  qty_expr = case(
    (Trade.trade_type == TradeType.buy, Trade.quantity),
    else_=-Trade.quantity,
  )
  trade_agg = (
    select(
      Trade.security_id,
      func.sum(qty_expr).label("net_quantity"),
      func.sum(case((Trade.trade_type == TradeType.buy, Trade.quantity), else_=0)).label("total_buy_qty"),
      func.sum(case((Trade.trade_type == TradeType.buy, Trade.quantity * Trade.price_per_unit), else_=0)).label("total_buy_cost"),
    )
    .group_by(Trade.security_id)
    .subquery()
  )

  # Latest price per security (using a correlated subquery for the max date)
  latest_price_date = select(func.max(SecurityPrice.price_date)).where(SecurityPrice.security_id == Security.id).correlate(Security).scalar_subquery()
  latest_price = (
    select(SecurityPrice.price_per_unit)
    .where(SecurityPrice.security_id == Security.id, SecurityPrice.price_date == latest_price_date)
    .correlate(Security)
    .scalar_subquery()
  )

  stmt = (
    select(
      Security.id,
      Security.name,
      Security.ticker,
      Security.asset_type,
      Security.currency,
      trade_agg.c.net_quantity,
      trade_agg.c.total_buy_qty,
      trade_agg.c.total_buy_cost,
      latest_price.label("current_price"),
    )
    .join(trade_agg, Security.id == trade_agg.c.security_id)
    .where(trade_agg.c.net_quantity > 0)
    .order_by(Security.name.asc())
  )

  result = await session.execute(stmt)
  holdings: list[HoldingSchema] = []

  for row in result.all():
    net_qty = int(row.net_quantity)
    total_buy_qty = int(row.total_buy_qty)
    total_buy_cost = int(row.total_buy_cost)

    # Average cost per unit (cents) = total_buy_cost / total_buy_qty
    # total_buy_cost is already quantity_micro * price_cents, so:
    # avg_cost = total_buy_cost / total_buy_qty  (cents, since micro cancels)
    avg_cost = total_buy_cost // total_buy_qty if total_buy_qty > 0 else 0

    # Cost basis = net_qty * avg_cost (micro-units * cents)
    # To get cents: cost_basis_cents = net_qty * avg_cost / 1_000_000
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
