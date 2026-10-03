from datetime import datetime

from pydantic import Field

from api.common.schemas import IDSchema, Schema, TimestampedSchema


class IngestTokenCreate(Schema):
  name: str = Field(
    min_length=1,
    max_length=100,
    description="Identifies the daemon and machine, e.g. 'monitor:laptop'. Creating a token revokes earlier tokens with the same name.",
  )


class IngestTokenSchema(IDSchema, TimestampedSchema):
  name: str
  last_used_at: datetime | None


class IngestTokenCreated(IngestTokenSchema):
  token: str = Field(description="The secret. Returned only once; store it in the daemon's env file.")
