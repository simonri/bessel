from datetime import date, timedelta
from enum import StrEnum
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from api.common.pagination import PaginationParamsQuery
from api.common.sorting import Sorting, SortingGetter
from api.exceptions import ResourceNotFound
from api.journal.repository import JournalEntryRepository
from api.journal.schemas import (
  JournalCalendarDay,
  JournalCalendarResponse,
  JournalEntryListResponse,
  JournalEntrySchema,
  JournalEntryUpsert,
  JournalStreakResponse,
)
from api.models.journal_entry import JournalEntry
from api.postgres import AsyncSession, get_db_session

router = APIRouter(prefix="/journal", tags=["journal"])


class JournalSortProperty(StrEnum):
  entry_date = "entry_date"
  created_at = "created_at"
  mood = "mood"
  energy = "energy"


sorting_getter = SortingGetter(JournalSortProperty, default_sorting=["-entry_date"])


def _compute_word_count(body: str | None) -> int:
  if not body:
    return 0
  return len(body.split())


@router.get(
  "",
  summary="List Journal Entries",
  response_model=JournalEntryListResponse,
)
async def list_entries(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  pagination: PaginationParamsQuery,
  sorting: Annotated[list[Sorting[JournalSortProperty]], Depends(sorting_getter)],
  tag: str | None = Query(default=None, description="Filter by tag."),
  search: str | None = Query(default=None, description="Search body text."),
) -> JournalEntryListResponse:
  repo = JournalEntryRepository.from_session(session)
  statement = repo.get_base_statement()

  if tag:
    statement = statement.where(JournalEntry.tags.any(tag))
  if search:
    pattern = f"%{search}%"
    statement = statement.where(
      JournalEntry.body.ilike(pattern)
      | JournalEntry.wins.ilike(pattern)
      | JournalEntry.learnings.ilike(pattern)
      | JournalEntry.gratitude.ilike(pattern)
      | JournalEntry.blockers.ilike(pattern)
    )

  for prop, desc in sorting:
    column = getattr(JournalEntry, prop.value)
    statement = statement.order_by(column.desc() if desc else column.asc())

  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  return JournalEntryListResponse.from_paginated_results(
    [JournalEntrySchema.model_validate(item) for item in items],
    total_count,
    pagination,
  )


@router.get(
  "/calendar",
  summary="Get Calendar Data",
  response_model=JournalCalendarResponse,
)
async def get_calendar(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  year: int = Query(..., description="Year."),
  month: int = Query(..., ge=1, le=12, description="Month."),
) -> JournalCalendarResponse:
  start = date(year, month, 1)
  if month == 12:
    end = date(year + 1, 1, 1)
  else:
    end = date(year, month + 1, 1)

  result = await session.execute(
    select(
      JournalEntry.entry_date,
      JournalEntry.mood,
      JournalEntry.word_count,
      JournalEntry.wins,
      JournalEntry.learnings,
    )
    .where(JournalEntry.entry_date >= start, JournalEntry.entry_date < end)
    .order_by(JournalEntry.entry_date)
  )

  days = [
    JournalCalendarDay(
      entry_date=row.entry_date,
      mood=row.mood,
      word_count=row.word_count,
      has_wins=bool(row.wins),
      has_learnings=bool(row.learnings),
    )
    for row in result.all()
  ]
  return JournalCalendarResponse(days=days)


@router.get(
  "/streak",
  summary="Get Streak Info",
  response_model=JournalStreakResponse,
)
async def get_streak(
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> JournalStreakResponse:
  result = await session.execute(select(JournalEntry.entry_date).order_by(JournalEntry.entry_date.desc()))
  dates = [row[0] for row in result.all()]

  if not dates:
    return JournalStreakResponse(current_streak=0, longest_streak=0, total_entries=0)

  # Current streak (from today backwards)
  current = 0
  check = date.today()
  date_set = set(dates)
  while check in date_set:
    current += 1
    check -= timedelta(days=1)

  # Longest streak
  longest = 0
  streak = 1
  sorted_dates = sorted(dates)
  for i in range(1, len(sorted_dates)):
    if sorted_dates[i] - sorted_dates[i - 1] == timedelta(days=1):
      streak += 1
    else:
      longest = max(longest, streak)
      streak = 1
  longest = max(longest, streak)

  return JournalStreakResponse(
    current_streak=current,
    longest_streak=longest,
    total_entries=len(dates),
  )


@router.get(
  "/{entry_date}",
  summary="Get Journal Entry",
  response_model=JournalEntrySchema | None,
)
async def get_entry(
  entry_date: date,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> JournalEntrySchema | None:
  repo = JournalEntryRepository.from_session(session)
  entry = await repo.get_by_date(entry_date)
  if entry is None:
    return None
  return JournalEntrySchema.model_validate(entry)


@router.put(
  "/{entry_date}",
  summary="Upsert Journal Entry",
  response_model=JournalEntrySchema,
)
async def upsert_entry(
  entry_date: date,
  body: JournalEntryUpsert,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> JournalEntrySchema:
  repo = JournalEntryRepository.from_session(session)
  entry = await repo.get_by_date(entry_date)

  data = body.model_dump(exclude_unset=True)
  data["word_count"] = _compute_word_count(data.get("body") or (entry.body if entry else None))

  if entry is None:
    entry = JournalEntry(entry_date=entry_date, **data)
    await repo.create(entry, flush=True)
  else:
    await repo.update(entry, update_dict=data)

  return JournalEntrySchema.model_validate(entry)


@router.delete(
  "/{entry_date}",
  summary="Delete Journal Entry",
  status_code=204,
)
async def delete_entry(
  entry_date: date,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
  repo = JournalEntryRepository.from_session(session)
  entry = await repo.get_by_date(entry_date)
  if entry is None:
    raise ResourceNotFound("Journal entry not found")
  await session.delete(entry)
