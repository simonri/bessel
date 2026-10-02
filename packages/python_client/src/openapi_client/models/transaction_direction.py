from enum import StrEnum


class TransactionDirection(StrEnum):
  CREDIT = "credit"
  DEBIT = "debit"

  def __str__(self) -> str:
    return str(self.value)
