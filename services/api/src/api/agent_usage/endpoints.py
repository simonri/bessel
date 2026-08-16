from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query

from api.agent_usage.repository import AgentUsageDailyRepository, AgentUsageStatusRepository
from api.agent_usage.schemas import (
  AgentUsageDailyEntry,
  AgentUsageDailyResponse,
  AgentUsageStatusEntry,
  AgentUsageStatusResponse,
  AgentUsageSyncRequest,
  AgentUsageSyncResponse,
)
from api.agent_usage.service import agent_usage_service
from api.exceptions import UnauthorizedError
from api.postgres import AsyncSession, get_db_session
from api.settings import settings
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/agent-usage", tags=["agent-usage"])


def _verify_internal_api_key(x_api_key: Annotated[str | None, Header()] = None) -> None:
  expected = settings.INTERNAL_API_KEY
  if not expected or x_api_key != expected:
    raise UnauthorizedError("Invalid or missing API key")


@router.post(
  "/sync",
  summary="Sync Agent Usage",
  response_model=AgentUsageSyncResponse,
  dependencies=[Depends(_verify_internal_api_key)],
)
async def sync_agent_usage(
  body: AgentUsageSyncRequest,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AgentUsageSyncResponse:
  if not body.daily and not body.rate_limits:
    return AgentUsageSyncResponse(daily_synced=0, status_synced=0)

  daily_repo = AgentUsageDailyRepository.from_session(session)
  status_repo = AgentUsageStatusRepository.from_session(session)
  daily_synced, status_synced = await agent_usage_service.sync(daily_repo, status_repo, body)
  return AgentUsageSyncResponse(daily_synced=daily_synced, status_synced=status_synced)


@router.get(
  "/status",
  summary="Get Agent Usage Status",
  response_model=AgentUsageStatusResponse,
)
async def get_agent_usage_status(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> AgentUsageStatusResponse:
  repo = AgentUsageStatusRepository.from_session(session)
  entries = await repo.get_latest()
  return AgentUsageStatusResponse(entries=[AgentUsageStatusEntry.model_validate(e) for e in entries])


@router.get(
  "/daily",
  summary="Get Agent Usage Daily Totals",
  response_model=AgentUsageDailyResponse,
)
async def get_agent_usage_daily(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  start_date: Annotated[date, Query(description="Start of range (inclusive).")],
  end_date: Annotated[date, Query(description="End of range (inclusive).")],
) -> AgentUsageDailyResponse:
  repo = AgentUsageDailyRepository.from_session(session)
  entries = await repo.get_entries(start_date, end_date)
  return AgentUsageDailyResponse(
    entries=[
      AgentUsageDailyEntry(
        date=e.date.isoformat(),
        device=e.device,
        agent=e.agent,
        model=e.model,
        input_tokens=e.input_tokens,
        output_tokens=e.output_tokens,
        cache_read_tokens=e.cache_read_tokens,
        cache_creation_tokens=e.cache_creation_tokens,
      )
      for e in entries
    ]
  )
