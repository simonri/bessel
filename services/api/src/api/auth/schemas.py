from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, field_validator

from api.common.schemas import Schema


class UserInfo(Schema):
  sub: str
  email: str | None = None
  name: str | None = None
  picture: str | None = None


class MeResponse(Schema):
  id: UUID
  email: str | None = None
  timezone: str | None = None


class MeUpdate(Schema):
  timezone: str = Field(max_length=64, description="IANA timezone name, e.g. 'Europe/Stockholm'.")

  @field_validator("timezone")
  @classmethod
  def _known_timezone(cls, value: str) -> str:
    try:
      ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError) as e:
      raise ValueError(f"Unknown timezone: {value}") from e
    return value
