from enum import StrEnum


class CalendarEventSchemaVisibilityType0(StrEnum):
  CONFIDENTIAL = "confidential"
  PRIVATE = "private"
  PUBLIC = "public"

  def __str__(self) -> str:
    return str(self.value)
