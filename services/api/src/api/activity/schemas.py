from pydantic import Field

from api.common.schemas import Schema


class ActivityEventIn(Schema):
    local_id: int = Field(description="Original SQLite id from the source machine.")
    ts: int = Field(description="Unix epoch seconds (UTC) when the event was recorded.")
    state: str = Field(description="'active' or 'idle'.")
    app_class: str | None = Field(default=None, description="Window class / app identifier.")
    title: str | None = Field(default=None, description="Window title.")
    workspace: str | None = Field(default=None, description="Workspace name or number.")


class ActivityBatchRequest(Schema):
    source: str = Field(description="Machine identifier, e.g. hostname.")
    events: list[ActivityEventIn] = Field(description="Batch of events to ingest.")


class ActivityBatchResponse(Schema):
    inserted: int = Field(description="Number of new events inserted.")
    skipped: int = Field(description="Number of duplicate events skipped.")
