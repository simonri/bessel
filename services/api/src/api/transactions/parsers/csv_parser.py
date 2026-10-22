import io
from collections import Counter
from datetime import date

from aiocsv import AsyncDictReader
from api.models.bank_profile import BankProfile
from api.models.transaction import TransactionDirection
from api.transactions.parsers.base import ParsedTransaction, compute_dedup_hash

# Stands in for a line break inside a field while the CSV reader splits rows.
_BREAK = "\x1f"
_PAYEE = "Mottagare:"


def _join_broken_rows(lines: list[str], delimiter: str) -> str:
  """The rows as the bank meant them.

  Marginalen doesn't quote a field that runs over several lines, such as the details of a payment
  abroad, so a line with fewer fields than the header goes on in the lines after it.
  """
  if not lines:
    return ""
  expected = lines[0].count(delimiter)
  rows: list[str] = []
  pending = ""
  for line in lines:
    text = line.rstrip("\r\n")
    pending = f"{pending}{_BREAK}{text}" if pending else text
    if pending.count(delimiter) >= expected:
      rows.append(pending)
      pending = ""
  if pending:
    rows.append(pending)
  return "\n".join(rows) + "\n"


def _describe(text: str) -> str:
  """A text over several lines, like a payment abroad, is described by who was paid."""
  lines = [line.strip() for line in text.split("\n") if line.strip()]
  if len(lines) <= 1:
    return text.strip()
  for line in lines:
    if line.startswith(_PAYEE):
      return line.removeprefix(_PAYEE).strip()
  return lines[0]


class _AsyncStringIO:
  """Wrap a StringIO so aiocsv can read it asynchronously."""

  def __init__(self, content: str) -> None:
    self._stream = io.StringIO(content, newline="")

  async def read(self, size: int = -1) -> str:
    return self._stream.read(size)


async def parse_csv(content: str, profile: BankProfile) -> list[ParsedTransaction]:
  """Parse CSV content using the column mapping from a BankProfile."""
  lines = content.splitlines(keepends=True)
  body = _join_broken_rows(lines[profile.skip_rows :], profile.delimiter)

  reader = AsyncDictReader(
    _AsyncStringIO(body),
    delimiter=profile.delimiter,
  )

  col = profile.column_map
  account_col = col.get("account_number")
  date_col = col["transaction_date"]
  currency_col = col.get("currency")
  amount_col = col["amount"]
  description_col = col.get("description", "")
  balance_col = col.get("balance")

  hash_counts: Counter[str] = Counter()
  transactions: list[ParsedTransaction] = []
  async for raw_row in reader:
    row = {key: value.replace(_BREAK, "\n") if isinstance(value, str) else value for key, value in raw_row.items()}
    date_str = (row.get(date_col) or "").strip()
    amount_str = (row.get(amount_col) or "").strip()

    if not date_str or not amount_str:
      continue

    tx_date = date.fromisoformat(date_str)

    amount_normalized = amount_str.replace(profile.decimal_separator, ".") if profile.decimal_separator != "." else amount_str
    amount_float = float(amount_normalized)

    if amount_float < 0:
      direction = TransactionDirection.debit
      amount_minor = round(abs(amount_float) * 100)
    else:
      direction = TransactionDirection.credit
      amount_minor = round(amount_float * 100)

    if amount_minor == 0:
      continue

    currency = (row.get(currency_col) or "").strip() if currency_col else ""
    currency = currency or profile.currency

    account_number = (row.get(account_col) or "").strip() if account_col else ""
    description = _describe(row.get(description_col) or "") if description_col else ""

    balance_str = (row.get(balance_col) or "").strip() if balance_col else ""
    dedup_desc = f"{balance_str}:{description}" if balance_str else description

    base_hash = compute_dedup_hash(
      bank=profile.bank_name,
      account_number=account_number,
      date=date_str,
      amount=amount_str,
      description=dedup_desc,
    )

    # Append occurrence index so truly identical rows get unique hashes
    occurrence = hash_counts[base_hash]
    hash_counts[base_hash] += 1
    dedup_hash = f"{base_hash}:{occurrence}" if occurrence > 0 else base_hash

    transactions.append(
      ParsedTransaction(
        transaction_date=tx_date,
        amount_minor=amount_minor,
        currency=currency,
        direction=direction,
        dedup_hash=dedup_hash,
        description=description,
        raw_data=dict(row),
      )
    )

  return transactions
