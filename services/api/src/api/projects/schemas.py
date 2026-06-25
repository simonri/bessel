from pydantic import Field

from api.common.schemas import IDSchema, Schema, TimestampedSchema


class ProjectSchema(IDSchema, TimestampedSchema):
  name: str


class ProjectCreate(Schema):
  name: str = Field(max_length=100)


class ProjectUpdate(Schema):
  name: str | None = Field(default=None, max_length=100)
