from enum import StrEnum


class InvestmentKind(StrEnum):
  BUY = "buy"
  DEPOSIT = "deposit"
  DIVIDEND = "dividend"
  FEE = "fee"
  INTEREST = "interest"
  SELL = "sell"
  TAX = "tax"
  WITHDRAWAL = "withdrawal"

  def __str__(self) -> str:
    return str(self.value)
