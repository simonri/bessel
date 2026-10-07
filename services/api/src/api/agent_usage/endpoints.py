from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

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
from api.ingest_tokens.dependencies import IngestUserId
from api.postgres import DBSession
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/agent-usage", tags=["agent-usage"])


@router.post(
  "/sync",
  summary="Sync Agent Usage",
  response_model=AgentUsageSyncResponse,
)
async def sync_agent_usage(
  body: AgentUsageSyncRequest,
  session: DBSession,
  user_id: IngestUserId,
) -> AgentUsageSyncResponse:
  if not body.daily and not body.rate_limits:
    return AgentUsageSyncResponse(daily_synced=0, status_synced=0)

  daily_repo = AgentUsageDailyRepository.from_session(session)
  status_repo = AgentUsageStatusRepository.from_session(session)
  daily_synced, status_synced = await agent_usage_service.sync(user_id, daily_repo, status_repo, body)
  return AgentUsageSyncResponse(daily_synced=daily_synced, status_synced=status_synced)


@router.get(
  "/status",
  summary="Get Agent Usage Status",
  response_model=AgentUsageStatusResponse,
)
async def get_agent_usage_status(
  session: DBSession,
  current_user: CurrentDBUser,
) -> AgentUsageStatusResponse:
  repo = AgentUsageStatusRepository.from_session(session)
  entries = await repo.get_latest(current_user.id)
  return AgentUsageStatusResponse(entries=[AgentUsageStatusEntry.model_validate(e) for e in entries])


@router.get(
  "/daily",
  summary="Get Agent Usage Daily Totals",
  response_model=AgentUsageDailyResponse,
)
async def get_agent_usage_daily(
  session: DBSession,
  current_user: CurrentDBUser,
  start_date: Annotated[date, Query(description="Start of range (inclusive).")],
  end_date: Annotated[date, Query(description="End of range (inclusive).")],
) -> AgentUsageDailyResponse:
  repo = AgentUsageDailyRepository.from_session(session)
  entries = await repo.get_entries(current_user.id, start_date, end_date)
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
