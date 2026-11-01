from datetime import datetime
from io import BytesIO

import pytest
from api.models.bank_profile import BankProfile
from api.models.transaction import TransactionDirection
from api.transactions.parsers.xlsx_parser import parse_xlsx
from openpyxl import Workbook


def _profile() -> BankProfile:
  return BankProfile(
    bank_name="skandiabanken",
    file_format="xlsx",
    column_map={"transaction_date": "Bokf. datum", "amount": "Belopp", "description": "Beskrivning", "balance": "Saldo", "account_number_cell": "B1"},
    skip_rows=3,
    decimal_separator=".",
    delimiter=",",
    currency="SEK",
  )


def _export(account_number: str) -> bytes:
  workbook = Workbook()
  sheet = workbook.active
  assert sheet is not None
  # The account details above the table are narrower than it.
  sheet.append(["Kontonummer", account_number])
  sheet.append(["Kontonamn", "Allkonto"])
  sheet.append([])
  sheet.append(["Bokf. datum", "Transaktionsdatum", "Beskrivning", "Belopp", "Saldo"])
  sheet.append([datetime(2026, 7, 28), datetime(2026, 7, 27), "Café Åre", -117.5, 882.5])
  buffer = BytesIO()
  workbook.save(buffer)
  return buffer.getvalue()


class TestSkandiaExport:
  @pytest.mark.asyncio
  async def test_reads_rows_under_account_details_narrower_than_the_table(self) -> None:
    [parsed] = await parse_xlsx(_export("9100-0000001"), _profile())

    assert (parsed.description, parsed.amount_minor, parsed.direction) == ("Café Åre", 11750, TransactionDirection.debit)

  @pytest.mark.asyncio
  async def test_the_account_number_tells_two_accounts_identical_rows_apart(self) -> None:
    [first] = await parse_xlsx(_export("9100-0000001"), _profile())
    [second] = await parse_xlsx(_export("9100-0000002"), _profile())

    assert first.dedup_hash != second.dedup_hash
