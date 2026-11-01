from typing import Annotated

from pydantic import Field

from api.common.schemas import IDSchema, Schema, TimestampedSchema

# An optional user, then a host or ssh config alias. No leading dash: the desktop app
# passes this to `ssh`, which would read it as an option such as -oProxyCommand.
SshHost = Annotated[str, Field(max_length=255, pattern=r"^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9_][A-Za-z0-9._-]*$")]
# No control characters: the desktop app writes names and paths into systemd units and shell commands, where a line
# break would start a line of its own.
ProjectName = Annotated[str, Field(max_length=100, pattern=r"^[^\x00-\x1f\x7f]*$")]
ProjectPath = Annotated[str, Field(max_length=500, pattern=r"^[^\x00-\x1f\x7f]*$")]


class ProjectSchema(IDSchema, TimestampedSchema):
  name: str
  path: str | None = None
  ssh_host: str | None = None


class ProjectCreate(Schema):
  name: ProjectName
  path: ProjectPath | None = None
  ssh_host: SshHost | None = None


class ProjectUpdate(Schema):
  name: ProjectName | None = None


class ProjectLocationUpdate(Schema):
  path: ProjectPath | None = None
  ssh_host: SshHost | None = None
