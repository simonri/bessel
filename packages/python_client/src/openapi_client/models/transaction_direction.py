from enum import Enum


class TransactionDirection(str, Enum):
  CREDIT = "credit"
  DEBIT = "debit"

  def __str__(self) -> str:
    return str(self.value)
