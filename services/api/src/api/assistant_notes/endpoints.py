from fastapi import APIRouter

from api.assistant_notes.repository import AssistantNoteRepository
from api.assistant_notes.schemas import AssistantNoteResponse, AssistantNotesResponse
from api.postgres import DBSession
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/assistant-notes", tags=["assistant-notes"])


@router.get(
  "",
  summary="List Assistant Notes",
  response_model=AssistantNotesResponse,
)
async def list_assistant_notes(session: DBSession, current_user: CurrentDBUser) -> AssistantNotesResponse:
  """What assistants saved over MCP to remember between conversations, e.g. the morning report's state."""
  notes = await AssistantNoteRepository.from_session(session).list_newest_first(current_user.id)
  return AssistantNotesResponse(
    notes=[AssistantNoteResponse(key=n.key, content=n.content, updated_at=n.modified_at or n.created_at) for n in notes],
  )
