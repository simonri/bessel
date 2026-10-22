from enum import StrEnum


class AccountOverviewGroup(StrEnum):
  CASH = "cash"
  CREDIT = "credit"
  INVESTMENTS = "investments"

  def __str__(self) -> str:
    return str(self.value)
