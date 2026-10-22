from enum import StrEnum


class OverviewTotalOwner(StrEnum):
  COMPANY = "company"
  PERSONAL = "personal"

  def __str__(self) -> str:
    return str(self.value)
