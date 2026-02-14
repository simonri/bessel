import hashlib
from dataclasses import dataclass
from datetime import date
from typing import Any

from api.models.transaction import TransactionDirection


@dataclass(frozen=True, slots=True)
class ParsedTransaction:
  transaction_date: date
  amount_minor: int
  currency: str
  direction: TransactionDirection
  dedup_hash: str
  description: str
  raw_data: dict[str, Any]


def compute_dedup_hash(
  bank: str,
  account_number: str,
  date: str,
  amount: str,
  description: str,
) -> str:
  """Create a SHA-256 hash from the transaction's identifying fields."""
  raw = f"{bank}:{account_number}:{date}:{amount}:{description}"
  return hashlib.sha256(raw.encode("utf-8")).hexdigest()
