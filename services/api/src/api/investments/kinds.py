"""What a movement in an investment account is, from the broker's own kind of movement."""

from typing import Literal

type InvestmentKind = Literal["buy", "sell", "deposit", "withdrawal", "dividend", "interest", "tax", "fee"]

_BY_TYPE: dict[str, InvestmentKind] = {
  "BUY": "buy",
  "SELL": "sell",
  "DEPOSIT": "deposit",
  "WITHDRAW": "withdrawal",
  "DIVIDEND": "dividend",
  "INTEREST": "interest",
  "TAX": "tax",
  "FOREIGN_TAX": "tax",
  "FEE": "fee",
}
# Avanza files some movements as UNKNOWN; their text says what they are ("Avkastningsskatt", "Riskpremie").
_BY_TEXT: tuple[tuple[str, InvestmentKind], ...] = (
  ("skatt", "tax"),
  ("ränta", "interest"),
  ("utdelning", "dividend"),
  ("avgift", "fee"),
  ("riskpremie", "fee"),
  ("köp av tjänst", "fee"),
)


def investment_kind(transaction_type: str | None, description: str | None) -> InvestmentKind | None:
  """None for anything the broker didn't import, and for a movement nothing here recognizes."""
  if transaction_type is None:
    return None
  if kind := _BY_TYPE.get(transaction_type):
    return kind
  text = (description or "").lower()
  return next((kind for word, kind in _BY_TEXT if word in text), None)
