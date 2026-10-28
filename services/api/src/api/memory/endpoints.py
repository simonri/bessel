from uuid import UUID

from fastapi import APIRouter

from api.memory.schemas import MemoryFactSchema, MemoryFactsResponse, MemoryFactUpdate
from api.memory.service import memory_service
from api.postgres import DBSession
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/memory", tags=["memory"])


@router.get("/facts", summary="List Memory Facts", response_model=MemoryFactsResponse)
async def list_memory_facts(session: DBSession, current_user: CurrentDBUser) -> MemoryFactsResponse:
  """What assistants know about the user now, most important first."""
  return MemoryFactsResponse(facts=await memory_service.list_current(session, current_user))


@router.patch("/facts/{fact_id}", summary="Correct Memory Fact", response_model=MemoryFactSchema)
async def correct_memory_fact(fact_id: UUID, update: MemoryFactUpdate, session: DBSession, current_user: CurrentDBUser) -> MemoryFactSchema:
  """Fix a fact by hand; it then counts as the user's own correction."""
  return await memory_service.correct(session, current_user, fact_id, update)


@router.delete("/facts/{fact_id}", summary="Forget Memory Fact", status_code=204)
async def forget_memory_fact(fact_id: UUID, session: DBSession, current_user: CurrentDBUser) -> None:
  """Remove a fact assistants should no longer know."""
  await memory_service.forget(session, current_user, fact_id)
