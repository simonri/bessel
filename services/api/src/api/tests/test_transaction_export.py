import csv
import io
import zipfile
from datetime import date
from uuid import uuid4

import pytest
import pytest_asyncio
from api.common.file_storage import file_storage
from api.documents.service import original_key
from api.models.bank_account import BankAccount
from api.models.category import Category
from api.models.document import Document, TransactionDocument
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.tests.fixtures.database import SaveFixture
from api.transactions import export as export_module
from httpx import AsyncClient

HEADER = ["Date", "Account", "Bank text", "Name", "Category", "Amount", "Currency", "Company or private", "Transfer", "Note", "Receipt", "Receipt files"]


@pytest_asyncio.fixture
async def account(save_fixture: SaveFixture, user: User) -> BankAccount:
  bank_account = BankAccount(name="Lönekonto", currency="SEK", base_balance=0, subtype="checking", user_id=user.id)
  await save_fixture(bank_account)
  return bank_account


@pytest_asyncio.fixture
async def company_account(save_fixture: SaveFixture, user: User) -> BankAccount:
  bank_account = BankAccount(name="Företagskonto", currency="SEK", base_balance=0, subtype="checking", is_business=True, user_id=user.id)
  await save_fixture(bank_account)
  return bank_account


async def _transaction(
  save_fixture: SaveFixture,
  account: BankAccount,
  description: str = "Kaffebaren",
  *,
  amount: int = 4950,
  day: date = date(2026, 10, 1),
  direction: TransactionDirection = TransactionDirection.debit,
  **fields: object,
) -> Transaction:
  transaction = Transaction(
    amount=amount,
    currency="SEK",
    transaction_date=day,
    direction=direction,
    dedup_hash=uuid4().hex,
    description=description,
    bank_account_id=account.id,
    user_id=account.user_id,
    **fields,
  )
  await save_fixture(transaction)
  return transaction


async def _receipt(save_fixture: SaveFixture, transaction: Transaction, filename: str, content: bytes) -> Document:
  document = Document(
    user_id=transaction.user_id, filename=filename, content_type="application/pdf", size_bytes=len(content), sha256=uuid4().hex * 2, page_count=1
  )
  await save_fixture(document)
  await save_fixture(TransactionDocument(transaction_id=transaction.id, document_id=document.id))
  await file_storage().put(original_key(document.id), content, "application/pdf")
  return document


def _rows(content: bytes, delimiter: str = ";") -> list[list[str]]:
  assert content.startswith(b"\xef\xbb\xbf")
  return list(csv.reader(io.StringIO(content.decode("utf-8-sig"), newline=""), delimiter=delimiter))


async def _export(client: AsyncClient, **params: object) -> list[list[str]]:
  response = await client.get("/v1/transactions/export", params=params)
  assert response.status_code == 200, response.text
  assert response.headers["content-type"].startswith("text/csv")
  return _rows(response.content, ";" if params.get("dialect", "swedish") == "swedish" else ",")


class TestTransactionExport:
  @pytest.mark.asyncio
  async def test_each_row_says_what_the_list_shows_with_money_out_negative(
    self, client: AsyncClient, save_fixture: SaveFixture, user: User, account: BankAccount
  ) -> None:
    category = Category(name="Restaurang", slug="restaurang", user_id=user.id)
    await save_fixture(category)
    await _transaction(save_fixture, account, "KAFFEBAREN 123", amount=12345, name="Kaffebaren", category_id=category.id, note="Fika")
    await _transaction(save_fixture, account, "LÖN", amount=3000000, direction=TransactionDirection.credit, day=date(2026, 10, 25))

    rows = await _export(client)

    assert rows == [
      HEADER,
      ["2026-10-01", "Lönekonto", "KAFFEBAREN 123", "Kaffebaren", "Restaurang", "-123,45", "SEK", "Private", "No", "Fika", "No", ""],
      ["2026-10-25", "Lönekonto", "LÖN", "", "", "30000,00", "SEK", "Private", "No", "", "No", ""],
    ]

  @pytest.mark.asyncio
  async def test_text_with_separators_quotes_and_line_breaks_comes_back_whole(
    self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount
  ) -> None:
    note = 'Lunch; with "Anna"\nand Erik, for the board'
    await _transaction(save_fixture, account, "RESTAURANG; AB", note=note)

    [_, row] = await _export(client)
    [_, international] = await _export(client, dialect="international")

    assert (row[2], row[9]) == ("RESTAURANG; AB", note)
    assert (international[2], international[5], international[9]) == ("RESTAURANG; AB", "-49.50", note)

  @pytest.mark.asyncio
  async def test_text_a_spreadsheet_would_run_as_a_formula_stays_text(
    self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount
  ) -> None:
    await _transaction(save_fixture, account, "=HYPERLINK(1)", name="+46701234567", note="-")

    [_, row] = await _export(client)

    assert (row[2], row[3], row[9], row[5]) == ("'=HYPERLINK(1)", "'+46701234567", "'-", "-49,50")

  @pytest.mark.asyncio
  async def test_the_list_filters_choose_the_rows(
    self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount, company_account: BankAccount
  ) -> None:
    await _transaction(save_fixture, company_account, "Webbhotell")
    await _transaction(save_fixture, account, "Kontorsstol", is_business=True, day=date(2026, 10, 2))
    await _transaction(save_fixture, account, "Matbutik")
    await _transaction(save_fixture, company_account, "Webbhotell", day=date(2026, 9, 30))
    await _transaction(save_fixture, account, "Bussbiljett", transfer_id=uuid4())

    company = await _export(client, is_business="true", date_from="2026-10-01", date_to="2026-10-31")
    private = await _export(client, is_business="false", transfers="false")
    searched = await _export(client, search="webb")

    assert [(row[2], row[7]) for row in company[1:]] == [("Webbhotell", "Company"), ("Kontorsstol", "Company")]
    assert [row[2] for row in private[1:]] == ["Matbutik"]
    assert [row[0] for row in searched[1:]] == ["2026-09-30", "2026-10-01"]

  @pytest.mark.asyncio
  async def test_says_which_are_transfers_and_which_have_receipts(
    self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount
  ) -> None:
    transfer = await _transaction(save_fixture, account, "Till sparkonto", transfer_id=uuid4())
    purchase = await _transaction(save_fixture, account, "Datorbutik", day=date(2026, 10, 2))
    await _receipt(save_fixture, purchase, "kvitto.pdf", b"%PDF-1")
    await _receipt(save_fixture, purchase, "faktura.pdf", b"%PDF-2")

    rows = {row[2]: row for row in (await _export(client))[1:]}

    assert transfer.description and (rows[transfer.description][8], rows[transfer.description][10]) == ("Yes", "No")
    assert (rows["Datorbutik"][8], rows["Datorbutik"][10], rows["Datorbutik"][11]) == ("No", "Yes", "kvitto.pdf, faktura.pdf")

  @pytest.mark.asyncio
  async def test_another_users_transactions_are_never_exported(
    self, other_client: AsyncClient, save_fixture: SaveFixture, account: BankAccount
  ) -> None:
    await _transaction(save_fixture, account, "Kaffebaren")

    response = await other_client.get("/v1/transactions/export")

    assert _rows(response.content) == [HEADER]

  @pytest.mark.asyncio
  async def test_rows_past_one_chunk_all_arrive_in_date_order(
    self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount, monkeypatch: pytest.MonkeyPatch
  ) -> None:
    monkeypatch.setattr(export_module, "ROWS_PER_CHUNK", 2)
    for day in (5, 3, 1, 4, 2):
      await _transaction(save_fixture, account, f"Dag {day}", day=date(2026, 10, day))

    rows = await _export(client)

    assert [row[2] for row in rows[1:]] == [f"Dag {day}" for day in range(1, 6)]


class TestReceiptsExport:
  @pytest.mark.asyncio
  async def test_the_zip_holds_the_csv_and_each_receipt_once_where_the_csv_points(
    self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount, company_account: BankAccount
  ) -> None:
    server = await _transaction(save_fixture, company_account, "Webbhotell")
    renewal = await _transaction(save_fixture, company_account, "Webbhotell förnyelse", day=date(2026, 10, 3))
    await _transaction(save_fixture, company_account, "Bankavgift", day=date(2026, 10, 2))
    await _transaction(save_fixture, account, "Matbutik")
    invoice = await _receipt(save_fixture, server, "faktura: oktober.pdf", b"%PDF-invoice")
    await save_fixture(TransactionDocument(transaction_id=renewal.id, document_id=invoice.id))

    response = await client.get("/v1/transactions/export/receipts", params={"is_business": "true"})

    assert response.status_code == 200, response.text
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    rows = _rows(archive.read("transactions.csv"))
    path = f"receipts/{str(invoice.id)[:8]}-faktura_ oktober.pdf"
    assert [(row[2], row[10], row[11]) for row in rows[1:]] == [
      ("Webbhotell", "Yes", path),
      ("Bankavgift", "No", ""),
      ("Webbhotell förnyelse", "Yes", path),
    ]
    assert sorted(archive.namelist()) == sorted(["transactions.csv", path])
    assert archive.read(path) == b"%PDF-invoice"

  @pytest.mark.asyncio
  async def test_a_receipt_missing_from_storage_is_left_out_not_a_failure(
    self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount
  ) -> None:
    purchase = await _transaction(save_fixture, account, "Datorbutik")
    lost = await _receipt(save_fixture, purchase, "kvitto.pdf", b"%PDF-1")
    await file_storage().delete(original_key(lost.id))

    response = await client.get("/v1/transactions/export/receipts")

    assert zipfile.ZipFile(io.BytesIO(response.content)).namelist() == ["transactions.csv"]


class TestAmountText:
  @pytest.mark.parametrize(
    ("minor", "direction", "expected"),
    [
      (12345, TransactionDirection.debit, "-123,45"),
      (5, TransactionDirection.debit, "-0,05"),
      (100, TransactionDirection.credit, "1,00"),
      (0, TransactionDirection.debit, "0,00"),
    ],
  )
  def test_minor_units_become_currency_units(self, minor: int, direction: TransactionDirection, expected: str) -> None:
    assert export_module.amount_text(minor, direction, decimal_mark=",") == expected
