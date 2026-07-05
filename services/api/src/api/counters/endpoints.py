from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from api.common.utils import utc_now
from api.counters.repository import CounterRepository, CounterResetRepository, CounterResetStats
from api.counters.schemas import CounterCreate, CounterResetSchema, CounterSchema, CounterUpdate
from api.exceptions import ResourceNotFound
from api.models.counter import Counter, CounterReset
from api.postgres import AsyncSession, get_db_session
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/counters", tags=["counters"])

_NO_RESETS = CounterResetStats(last_reset_at=None, reset_count=0)


def _to_schema(counter: Counter, stats: CounterResetStats) -> CounterSchema:
  return CounterSchema(
    id=counter.id,
    name=counter.name,
    created_at=counter.created_at,
    modified_at=counter.modified_at,
    last_reset_at=stats.last_reset_at,
    reset_count=stats.reset_count,
  )


async def _get_counter_or_404(session: AsyncSession, counter_id: UUID, user_id: UUID) -> Counter:
  repo = CounterRepository.from_session(session)
  counter = await repo.get_by_id(counter_id)
  if not counter or counter.deleted_at is not None or counter.user_id != user_id:
    raise ResourceNotFound(detail="Counter not found.")
  return counter


@router.get("", summary="List Counters", response_model=list[CounterSchema])
async def list_counters(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
) -> list[CounterSchema]:
  counters = await CounterRepository.from_session(session).list_for_user(current_user.id)
  if not counters:
    return []

  stats_by_id = await CounterResetRepository.from_session(session).get_stats_by_counter([c.id for c in counters])
  return [_to_schema(c, stats_by_id.get(c.id, _NO_RESETS)) for c in counters]


@router.post("", summary="Create Counter", response_model=CounterSchema, status_code=201)
async def create_counter(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  body: CounterCreate,
) -> CounterSchema:
  repo = CounterRepository.from_session(session)
  counter = await repo.create(Counter(name=body.name, user_id=current_user.id), flush=True)
  return _to_schema(counter, _NO_RESETS)


@router.patch("/{counter_id}", summary="Update Counter", response_model=CounterSchema)
async def update_counter(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  counter_id: UUID,
  body: CounterUpdate,
) -> CounterSchema:
  counter = await _get_counter_or_404(session, counter_id, current_user.id)
  repo = CounterRepository.from_session(session)
  counter = await repo.update(counter, update_dict=body.model_dump(exclude_unset=True), flush=True)

  stats_by_id = await CounterResetRepository.from_session(session).get_stats_by_counter([counter_id])
  return _to_schema(counter, stats_by_id.get(counter_id, _NO_RESETS))


@router.delete("/{counter_id}", summary="Delete Counter", status_code=204)
async def delete_counter(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  counter_id: UUID,
) -> None:
  counter = await _get_counter_or_404(session, counter_id, current_user.id)
  repo = CounterRepository.from_session(session)
  await repo.update(counter, update_dict={"deleted_at": utc_now()})


@router.post(
  "/{counter_id}/resets",
  summary="Record Reset",
  response_model=CounterResetSchema,
  status_code=201,
)
async def create_reset(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  counter_id: UUID,
) -> CounterResetSchema:
  await _get_counter_or_404(session, counter_id, current_user.id)
  repo = CounterResetRepository.from_session(session)
  reset = await repo.create(CounterReset(counter_id=counter_id, user_id=current_user.id), flush=True)
  return CounterResetSchema.model_validate(reset)


@router.get(
  "/{counter_id}/resets",
  summary="List Resets",
  response_model=list[CounterResetSchema],
)
async def list_resets(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  counter_id: UUID,
) -> list[CounterResetSchema]:
  await _get_counter_or_404(session, counter_id, current_user.id)
  resets = await CounterResetRepository.from_session(session).list_for_counter(counter_id)
  return [CounterResetSchema.model_validate(r) for r in resets]


@router.delete(
  "/{counter_id}/resets/{reset_id}",
  summary="Undo Reset",
  status_code=204,
)
async def undo_reset(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  current_user: CurrentDBUser,
  counter_id: UUID,
  reset_id: UUID,
) -> None:
  await _get_counter_or_404(session, counter_id, current_user.id)
  repo = CounterResetRepository.from_session(session)
  reset = await repo.get_active(counter_id, reset_id)
  if not reset:
    raise ResourceNotFound(detail="Reset not found.")
  await repo.update(reset, update_dict={"deleted_at": utc_now()})
