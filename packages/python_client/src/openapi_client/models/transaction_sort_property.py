from enum import Enum


class TransactionSortProperty(str, Enum):
  AMOUNT = "amount"
  CREATED_AT = "created_at"
  TRANSACTION_DATE = "transaction_date"
  VALUE_1 = "-created_at"
  VALUE_3 = "-transaction_date"
  VALUE_5 = "-amount"

  def __str__(self) -> str:
    return str(self.value)
