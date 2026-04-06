from enum import Enum


class RruleFrequency(str, Enum):
  DAILY = "daily"
  MONTHLY = "monthly"
  WEEKLY = "weekly"
  YEARLY = "yearly"

  def __str__(self) -> str:
    return str(self.value)
