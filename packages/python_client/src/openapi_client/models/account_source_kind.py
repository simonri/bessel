from enum import StrEnum


class AccountSourceKind(StrEnum):
  AVANZA = "avanza"
  BANK = "bank"
  KLARNA = "klarna"
  MANUAL = "manual"

  def __str__(self) -> str:
    return str(self.value)
