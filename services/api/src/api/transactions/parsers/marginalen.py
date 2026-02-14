import csv
import io
from datetime import date

from api.models.transaction import TransactionDirection
from api.transactions.parsers.base import ParsedTransaction, compute_dedup_hash


def parse_marginalen_csv(content: str) -> list[ParsedTransaction]:
  """Parse a Marginalen bank CSV export into ParsedTransaction objects.

  The CSV uses semicolon delimiters and Swedish decimal format (comma).
  """
  reader = csv.reader(io.StringIO(content), delimiter=";")

  # Skip header row
  next(reader, None)

  transactions: list[ParsedTransaction] = []
  for row in reader:
    if len(row) < 19:
      continue

    account_number = row[1].strip()
    booking_date_str = row[3].strip()
    currency = row[7].strip() or "SEK"
    amount_str = row[8].strip()
    description = row[17].strip()

    if not booking_date_str or not amount_str:
      continue

    # Skip rows with placeholder dates
    if booking_date_str.startswith("0001-"):
      continue

    # Parse date
    tx_date = date.fromisoformat(booking_date_str)

    # Parse amount: Swedish format uses comma for decimal separator
    amount_str_normalized = amount_str.replace(",", ".")
    amount_float = float(amount_str_normalized)

    # Determine direction
    if amount_float < 0:
      direction = TransactionDirection.debit
      amount_minor = round(abs(amount_float) * 100)
    else:
      direction = TransactionDirection.credit
      amount_minor = round(amount_float * 100)

    # Skip zero-amount rows
    if amount_minor == 0:
      continue

    dedup_hash = compute_dedup_hash(
      bank="marginalen",
      account_number=account_number,
      date=booking_date_str,
      amount=amount_str,
      description=description,
    )

    transactions.append(
      ParsedTransaction(
        transaction_date=tx_date,
        amount_minor=amount_minor,
        currency=currency,
        direction=direction,
        dedup_hash=dedup_hash,
      )
    )

  return transactions
