import threading
from datetime import date
from io import BytesIO

import pytest
from api.models.bank_profile import BankProfile
from api.transactions.parsers import xlsx_parser
from openpyxl import Workbook
from pytest_mock import MockerFixture


def _xlsx() -> bytes:
  wb = Workbook()
  ws = wb.active
  assert ws is not None
  ws.append(["Datum", "Belopp", "Text"])
  ws.append([date(2026, 10, 1), -120.5, "ICA"])
  out = BytesIO()
  wb.save(out)
  return out.getvalue()


PROFILE = BankProfile(
  bank_name="test-bank",
  file_format="xlsx",
  column_map={"transaction_date": "Datum", "amount": "Belopp", "description": "Text"},
  skip_rows=0,
  decimal_separator=".",
  delimiter=",",
  currency="SEK",
)


class TestXlsxImport:
  @pytest.mark.asyncio
  async def test_parses_off_the_event_loop(self, mocker: MockerFixture) -> None:
    # A large workbook takes openpyxl seconds; on the loop it would stall every other request.
    parse = mocker.spy(xlsx_parser, "_parse_xlsx")
    threads: list[threading.Thread] = []
    original = xlsx_parser.load_workbook
    mocker.patch.object(xlsx_parser, "load_workbook", lambda *a, **k: threads.append(threading.current_thread()) or original(*a, **k))

    rows = await xlsx_parser.parse_xlsx(_xlsx(), PROFILE)

    assert [r.description for r in rows] == ["ICA"]
    assert parse.call_count == 1
    assert threads and threads[0] is not threading.main_thread()
