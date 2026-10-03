from enum import StrEnum


class CalendarProvider(StrEnum):
  GOOGLE = "google"
  ICLOUD = "icloud"

  def __str__(self) -> str:
    return str(self.value)
