"""Transactions as a spreadsheet, and as a zip of the spreadsheet with its receipts for a bookkeeper.

The default suits Excel set up for Sweden, which opens a .csv with a double click: semicolons between fields and a
decimal comma, as its list separator and number format expect. Text is UTF-8 behind a byte order mark, without which
Excel reads å, ä and ö as Windows-1252; a `sep=;` line is never added, as Excel then ignores the mark. Google Sheets
finds the semicolons itself, and reads the decimal comma as a number in a spreadsheet set to Sweden. `international`
uses commas and a decimal point instead, for Excel and Sheets in English. Dates are ISO (2026-10-31), which both read.
"""

import csv
import io
import re
import zipfile
from collections.abc import AsyncIterable, AsyncIterator, Callable
from enum import StrEnum
from uuid import UUID

import structlog
from api.common.file_storage import file_storage
from api.common.utils import utc_now
from api.documents.service import original_key
from api.models.transaction import TransactionDirection
from api.transactions.repository import ExportRow

log = structlog.get_logger()

BOM = "﻿"
ROWS_PER_CHUNK = 500
CSV_NAME = "transactions.csv"
RECEIPTS_FOLDER = "receipts"

HEADER = [
  "Date",
  "Account",
  "Bank text",
  "Name",
  "Category",
  "Amount",
  "Currency",
  "Company or private",
  "Transfer",
  "Note",
  "Receipt",
  "Receipt files",
]

# A spreadsheet runs a cell that starts with one of these as a formula; a leading ' keeps it text.
_FORMULA_START = ("=", "+", "-", "@", "\t", "\r")
_UNSAFE_IN_FILENAME = re.compile(r'[\x00-\x1f/\\:*?"<>|]+')


class CsvDialect(StrEnum):
  swedish = "swedish"
  international = "international"


def _csv_format(dialect: CsvDialect) -> tuple[str, str]:
  """The field separator and the decimal mark."""
  return (";", ",") if dialect is CsvDialect.swedish else (",", ".")


def amount_text(minor: int, direction: TransactionDirection, *, decimal_mark: str) -> str:
  """Money out as a negative number, in currency units: 12345 öre out is -123,45."""
  whole, cents = divmod(minor, 100)
  sign = "-" if direction is TransactionDirection.debit and minor else ""
  return f"{sign}{whole}{decimal_mark}{cents:02d}"


def _text(value: str | None) -> str:
  if not value:
    return ""
  return f"'{value}" if value.startswith(_FORMULA_START) else value


def _yes_no(value: bool) -> str:
  return "Yes" if value else "No"


def _row(row: ExportRow, files: list[str], *, decimal_mark: str) -> list[str]:
  return [
    row.transaction_date.isoformat(),
    _text(row.account),
    _text(row.description),
    _text(row.name),
    _text(row.category),
    amount_text(row.amount, row.direction, decimal_mark=decimal_mark),
    row.currency,
    "Company" if row.company else "Private",
    _yes_no(row.transfer),
    _text(row.note),
    _yes_no(bool(row.document_ids)),
    _text(", ".join(files)),
  ]


async def csv_chunks(
  rows: AsyncIterable[ExportRow],
  dialect: CsvDialect,
  *,
  files: Callable[[ExportRow], list[str]] = lambda row: row.document_filenames,
) -> AsyncIterator[str]:
  """The spreadsheet, a few hundred rows at a time; `files` names each row's receipts."""
  separator, decimal_mark = _csv_format(dialect)
  buffer = io.StringIO()
  writer = csv.writer(buffer, delimiter=separator, lineterminator="\r\n")
  buffer.write(BOM)
  writer.writerow(HEADER)
  count = 0
  async for row in rows:
    writer.writerow(_row(row, files(row), decimal_mark=decimal_mark))
    count += 1
    if count % ROWS_PER_CHUNK == 0:
      yield buffer.getvalue()
      buffer.seek(0)
      buffer.truncate()
  yield buffer.getvalue()


def receipt_path(document_id: UUID, filename: str) -> str:
  """Where a receipt lies in the zip: unique by its id, and still named as it was uploaded."""
  safe = _UNSAFE_IN_FILENAME.sub("_", filename).strip(" .") or "document"
  return f"{RECEIPTS_FOLDER}/{str(document_id)[:8]}-{safe}"


class _Sink:
  """Takes what the zip writes, to be handed on as it comes: a response can't seek back."""

  def __init__(self) -> None:
    self.buffer = bytearray()

  def write(self, data: bytes, /) -> int:
    self.buffer += data
    return len(data)

  def flush(self) -> None:
    pass

  def close(self) -> None:
    pass

  def take(self) -> bytes:
    data = bytes(self.buffer)
    self.buffer.clear()
    return data


async def receipts_zip(rows: AsyncIterable[ExportRow], dialect: CsvDialect) -> AsyncIterator[bytes]:
  """The spreadsheet, whose last column points into the zip, then every receipt it names, each once."""
  sink = _Sink()
  paths: dict[UUID, str] = {}

  def files(row: ExportRow) -> list[str]:
    for document_id, filename in zip(row.document_ids, row.document_filenames, strict=True):
      paths.setdefault(document_id, receipt_path(document_id, filename))
    return [paths[document_id] for document_id in row.document_ids]

  with zipfile.ZipFile(sink, "w", compression=zipfile.ZIP_STORED) as archive:
    sheet = zipfile.ZipInfo(CSV_NAME, date_time=utc_now().timetuple()[:6])
    sheet.compress_type = zipfile.ZIP_DEFLATED
    with archive.open(sheet, "w") as entry:
      async for chunk in csv_chunks(rows, dialect, files=files):
        entry.write(chunk.encode())
        yield sink.take()

    storage = file_storage()
    for document_id, path in paths.items():
      content = await storage.get(original_key(document_id))
      if content is None:
        log.warning("export_receipt_missing", document_id=str(document_id))
        continue
      # PDFs and photos are compressed already.
      archive.writestr(path, content)
      yield sink.take()
  yield sink.take()
