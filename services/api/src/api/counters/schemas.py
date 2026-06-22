from datetime import datetime

from pydantic import UUID4

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
