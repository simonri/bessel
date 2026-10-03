from enum import StrEnum


class RecurrenceSchemaFrequency(StrEnum):
  DAILY = "daily"
  MONTHLY = "monthly"
  WEEKLY = "weekly"
  YEARLY = "yearly"

  def __str__(self) -> str:
    return str(self.value)
