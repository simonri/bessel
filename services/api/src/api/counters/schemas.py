from datetime import datetime

from pydantic import UUID4, AwareDatetime, Field

from api.common.schemas import IDSchema, Schema, TimestampedSchema


class CounterSchema(IDSchema, TimestampedSchema):
  name: str
  last_reset_at: datetime | None
  reset_count: int


class CounterCreate(Schema):
  name: str


class CounterUpdate(Schema):
  name: str | None = None


class CounterResetSchema(IDSchema, TimestampedSchema):
  counter_id: UUID4
  occurred_at: datetime = Field(description="When it happened; can be earlier than created_at.")


class CounterResetCreate(Schema):
  occurred_at: AwareDatetime | None = Field(default=None, description="When it happened, if not now. Can't be in the future.")
