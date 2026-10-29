from datetime import date
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from mcp.server.mcpserver import Context
from pydantic import Field

from api.common.schemas import Schema
from api.mcp.context import user_session
from api.mcp.dates import today_in
from api.mcp.tools.common import ToolSpec, read, write
from api.memory.schemas import FactChange, MemoryFactSchema, MemoryProfile, NewFact, RememberResponse, ReviseResponse
from api.memory.service import memory_service
from api.models.memory_fact import MemoryStatus
from api.models.user import User


def _today(user: User) -> date:
  """Memory works before the user's apps have reported a timezone; dates then fall on UTC days."""
  try:
    zone = ZoneInfo(user.timezone or "UTC")
  except (ZoneInfoNotFoundError, ValueError):
    zone = ZoneInfo("UTC")
  return today_in(zone)


async def get_profile(ctx: Context) -> MemoryProfile:
  """Who the user is: what matters most about them, by area, plus every area known about and what changed this week.

  Read it before anything else in a conversation, so you never ask for or guess what is already known, and never
  bring up what they declined. search_memory finds the rest.
  """
  async with user_session(ctx) as (session, user):
    return await memory_service.profile(session, user, today=_today(user))


class MemorySearch(Schema):
  facts: list[MemoryFactSchema]


async def search_memory(
  ctx: Context,
  query: Annotated[str | None, Field(description="Words that must all appear in the area, attribute or fact, e.g. 'sko' or 'mamma födelsedag'.")] = None,
  area: Annotated[str | None, Field(description="Only this area and the ones under it, e.g. 'kropp'.")] = None,
  status: Annotated[MemoryStatus | None, Field(description="e.g. 'hypothesis' for the guesses still to test.")] = None,
  as_of: Annotated[date | None, Field(description="What was true on this day, including facts that have since changed.")] = None,
  include_past: Annotated[bool, Field(description="Also facts that ended, were replaced or were rejected.")] = False,
  limit: Annotated[int, Field(ge=1, le=200)] = 50,
) -> MemorySearch:
  """Look up what is known about the user beyond the profile, with each fact's evidence and history."""
  async with user_session(ctx) as (session, user):
    facts = await memory_service.search(session, user, query=query, area=area, status=status, as_of=as_of, include_past=include_past, limit=limit)
  return MemorySearch(facts=facts)


async def remember(
  ctx: Context,
  facts: Annotated[list[NewFact], Field(min_length=1, max_length=25)],
) -> RememberResponse:
  """Store what you learned about the user: anything, from their shoe size to what comes before their late nights.

  One fact per attribute in an area: the same fact again only confirms it, and a different value for an attribute already known
  comes back as a conflict for you to settle with revise_memory. Look at `similar` on what was added and merge where
  two facts say the same. Store observations with their evidence, not judgements of the user; what the user says
  wins over what you inferred. About other people keep only what matters for the user's relationship with them,
  never message contents.
  """
  async with user_session(ctx) as (session, user):
    results = await memory_service.remember(session, user, facts, today=_today(user))
  return RememberResponse(results=results)


async def revise_memory(
  ctx: Context,
  changes: Annotated[list[FactChange], Field(min_length=1, max_length=25)],
) -> ReviseResponse:
  """Keep what is known true and compact: confirm, correct, replace, merge, reject or end facts.

  Nothing is deleted: a replaced or ended fact keeps its history for search_memory(include_past or as_of).
  """
  async with user_session(ctx) as (session, user):
    results = await memory_service.revise(session, user, changes, today=_today(user))
  return ReviseResponse(results=results)


TOOLS: list[ToolSpec] = [
  read(get_profile, "Profile"),
  read(search_memory, "Search memory"),
  write(remember, "Remember"),
  write(revise_memory, "Revise memory"),
]
