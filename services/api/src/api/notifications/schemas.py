from datetime import datetime
from typing import Literal

from pydantic import Field

from api.common.schemas import IDSchema, Schema, TimestampedSchema

NotificationKind = Literal["info", "success", "warning", "error"]


class NotificationCreate(Schema):
  title: str = Field(description="Short notification title.")
  body: str | None = Field(default=None, description="Optional longer description.")
  kind: NotificationKind = Field(default="info", description="Severity/type of notification.")


class NotificationResponse(IDSchema, TimestampedSchema):
  title: str
  body: str | None
  kind: str
  read_at: datetime | None


class NotificationsListResponse(Schema):
  notifications: list[NotificationResponse]
  unread_count: int
