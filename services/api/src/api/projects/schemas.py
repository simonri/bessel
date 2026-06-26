from pydantic import Field

from api.common.schemas import IDSchema, Schema, TimestampedSchema


class ProjectSchema(IDSchema, TimestampedSchema):
  name: str
  path: str | None = None


class ProjectCreate(Schema):
  name: str = Field(max_length=100)
  path: str | None = Field(default=None, max_length=500)


class ProjectUpdate(Schema):
  name: str | None = Field(default=None, max_length=100)
  path: str | None = Field(default=None, max_length=500)
