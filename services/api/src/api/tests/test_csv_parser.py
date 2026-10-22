import pytest
from api.models.bank_profile import BankProfile
from api.models.transaction import TransactionDirection
from api.transactions.parsers.csv_parser import parse_csv

COLUMNS = [
  "Kundnummer",
  "Frånkontonummer",
  "Landskod",
  "Bokföringsdatum",
  "Transaktionsdatum",
  "Valuteringsdatum",
  "Referens",
  "Valuta",
  "Belopp",
  "Tecken belopp",
  "Ursprunglig valuta",
  "Ursprungligt belopp",
  "Mottagande kontonummer",
  "Egen referens ID",
  "Egen referens",
  "Transaktionskod",
  "Transaktionskodtext",
  "Transaktionstext",
  "Händelsetext",
  "Saldo",
  "Tecken saldo",
  "Bankgironummer",
]
HEADER = ";".join(COLUMNS) + "\n"
PLAIN = "1;9000;;2026-07-28;2026-07-28;2026-07-28;;SEK;-1117,00;;SEK;-1117,00;5613;;Bredband;341;;Bredband;;53408,73;;\n"
DETAILS = "\n".join(["Utfört belopp: EUR 9", "Valutakurs: 11,25569", "Mottagare: VERO SKATT", "Meddelande: RF54 2003", "Avgift: 2 kr Debiteras separat"])
# A payment abroad: Marginalen writes its details over several lines without quoting them.
ABROAD = f"1;9000;;2026-07-15;2026-07-15;2026-07-15;;SEK;-101,30;;SEK;-101,30;;;{DETAILS};0;;{DETAILS};;23058,71;;\n"
FEE = "1;9000;;2026-07-15;2026-07-15;2026-07-15;;SEK;-2,00;;SEK;-2,00;;;;0;;EU-betalning Företag;;23056,71;;\n"


def _profile() -> BankProfile:
  return BankProfile(
    bank_name="marginalen",
    file_format="csv",
    column_map={
      "amount": "Belopp",
      "currency": "Valuta",
      "description": "Transaktionstext",
      "account_number": "Frånkontonummer",
      "transaction_date": "Bokföringsdatum",
      "balance": "Saldo",
    },
    skip_rows=0,
    decimal_separator=",",
    delimiter=";",
    currency="SEK",
  )


class TestMarginalenExport:
  @pytest.mark.asyncio
  async def test_a_row_over_several_lines_is_one_transaction_described_by_who_was_paid(self) -> None:
    parsed = await parse_csv(HEADER + PLAIN + ABROAD + FEE, _profile())

    assert [(t.description, t.amount_minor, t.direction) for t in parsed] == [
      ("Bredband", 111700, TransactionDirection.debit),
      ("VERO SKATT", 10130, TransactionDirection.debit),
      ("EU-betalning Företag", 200, TransactionDirection.debit),
    ]
    abroad = parsed[1]
    assert abroad.raw_data["Saldo"] == "23058,71"
    assert abroad.raw_data["Transaktionstext"].splitlines() == [
      "Utfört belopp: EUR 9",
      "Valutakurs: 11,25569",
      "Mottagare: VERO SKATT",
      "Meddelande: RF54 2003",
      "Avgift: 2 kr Debiteras separat",
    ]

  @pytest.mark.asyncio
  async def test_the_balance_keeps_same_day_same_amount_payments_apart(self) -> None:
    first, second = await parse_csv(HEADER + ABROAD + ABROAD.replace("23058,71", "22957,41"), _profile())

    assert first.dedup_hash != second.dedup_hash
    assert ":" not in first.dedup_hash and ":" not in second.dedup_hash

  @pytest.mark.asyncio
  async def test_windows_line_endings_read_the_same(self) -> None:
    unix = await parse_csv(HEADER + PLAIN + ABROAD, _profile())
    windows = await parse_csv((HEADER + PLAIN + ABROAD).replace("\n", "\r\n"), _profile())

    assert [(t.description, t.dedup_hash) for t in windows] == [(t.description, t.dedup_hash) for t in unix]
