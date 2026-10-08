from typing import Annotated

from fastapi import APIRouter, Query

from api.postgres import DBSession
from api.search.schemas import SearchResponse
from api.search.service import search_service
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", summary="Search", response_model=SearchResponse)
async def search(
  session: DBSession,
  current_user: CurrentDBUser,
  q: Annotated[str, Query(min_length=2, max_length=100, description="Text to look for in titles, notes and names.")],
  limit: Annotated[int, Query(ge=1, le=20, description="Most results per kind.")] = 5,
) -> SearchResponse:
  """Tasks, recipes, calendar events and saved places matching `q`, for the command palette."""
  return await search_service.search(session, current_user.id, q.strip(), limit=limit)
