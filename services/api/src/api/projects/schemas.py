from typing import Annotated

from pydantic import Field

from api.common.schemas import IDSchema, Schema, TimestampedSchema

# An optional user, then a host or ssh config alias. No leading dash: the desktop app
# passes this to `ssh`, which would read it as an option such as -oProxyCommand.
SshHost = Annotated[str, Field(max_length=255, pattern=r"^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9_][A-Za-z0-9._-]*$")]


class ProjectSchema(IDSchema, TimestampedSchema):
  name: str
  path: str | None = None
  ssh_host: str | None = None


class ProjectCreate(Schema):
  name: str = Field(max_length=100)
  path: str | None = Field(default=None, max_length=500)
  ssh_host: SshHost | None = None


class ProjectUpdate(Schema):
  name: str | None = Field(default=None, max_length=100)


class ProjectLocationUpdate(Schema):
  path: str | None = Field(default=None, max_length=500)
  ssh_host: SshHost | None = None
