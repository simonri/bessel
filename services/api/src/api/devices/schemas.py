from datetime import datetime

from pydantic import Field

from api.common.schemas import IDSchema, Schema, TimestampedSchema


class DeviceSchema(IDSchema, TimestampedSchema):
  name: str
  last_seen_at: datetime


class DeviceUpdate(Schema):
  name: str = Field(max_length=100)
