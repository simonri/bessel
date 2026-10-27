from datetime import datetime

from pydantic import Field

from api.common.schemas import Schema


class AssistantNoteResponse(Schema):
  key: str = Field(description="What the assistant saved it under, e.g. 'morgonrapport'.")
  content: str
  updated_at: datetime


class AssistantNotesResponse(Schema):
  notes: list[AssistantNoteResponse] = Field(description="Most recently updated first.")
