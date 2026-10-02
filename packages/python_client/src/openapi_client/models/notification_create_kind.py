from enum import StrEnum


class NotificationCreateKind(StrEnum):
  ERROR = "error"
  INFO = "info"
  SUCCESS = "success"
  WARNING = "warning"

  def __str__(self) -> str:
    return str(self.value)
