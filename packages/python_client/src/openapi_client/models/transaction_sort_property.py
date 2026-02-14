from enum import Enum


class TransactionSortProperty(str, Enum):
  AMOUNT = "amount"
  CREATED_AT = "created_at"
  DESCRIPTION = "description"
  TRANSACTION_DATE = "transaction_date"
  VALUE_1 = "-created_at"
  VALUE_3 = "-transaction_date"
  VALUE_5 = "-amount"
  VALUE_7 = "-description"

  def __str__(self) -> str:
    return str(self.value)
