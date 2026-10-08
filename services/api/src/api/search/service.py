from uuid import UUID

from api.calendars.repository import CalendarEventRepository
from api.places.repository import PlaceRepository
from api.postgres import AsyncSession
from api.recipes.repository import RecipeRepository
from api.search.schemas import EventHit, PlaceHit, RecipeHit, SearchResponse, TaskHit
from api.tasks.repository import TaskRepository


class SearchService:
  async def search(self, session: AsyncSession, user_id: UUID, query: str, *, limit: int) -> SearchResponse:
    tasks = await TaskRepository.from_session(session).search(user_id, query, limit=limit)
    recipes = await RecipeRepository.from_session(session).search(user_id, query, limit=limit)
    events = await CalendarEventRepository.from_session(session).search(user_id, query, limit=limit)
    places = await PlaceRepository.from_session(session).search(user_id, query, limit=limit)
    return SearchResponse(
      tasks=[TaskHit.model_validate(t) for t in tasks],
      recipes=[RecipeHit.model_validate(r) for r in recipes],
      events=[EventHit.model_validate(e) for e in events],
      places=[PlaceHit.model_validate(p) for p in places],
    )


search_service = SearchService()
