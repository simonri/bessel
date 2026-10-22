import io
from datetime import date
from pathlib import Path
from uuid import uuid4

import pypdfium2
import pytest
import pytest_asyncio
from api.common import file_storage as storage_module
from api.documents import endpoints as document_endpoints
from api.documents import service as document_service_module
from api.models.bank_account import BankAccount
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.settings import Environment, settings
from api.tests.fixtures.database import SaveFixture
from botocore.stub import Stubber
from httpx import AsyncClient
from PIL import Image


def a_pdf(pages: int = 2) -> bytes:
  pdf = pypdfium2.PdfDocument.new()
  for _ in range(pages):
    pdf.new_page(595, 842)
  out = io.BytesIO()
  pdf.save(out)
  pdf.close()
  return out.getvalue()


def a_phone_photo() -> bytes:
  """A landscape JPEG that the phone says is rotated a quarter turn, with where it was taken."""
  image = Image.new("RGB", (400, 200), "white")
  exif = Image.Exif()
  exif[0x0112] = 6  # Orientation: rotate 90° clockwise to show
  exif.get_ifd(0x8825)[2] = (59.0, 19.0, 0.0)  # GPS latitude
  out = io.BytesIO()
  image.save(out, format="JPEG", exif=exif)
  return out.getvalue()


@pytest_asyncio.fixture
async def account(save_fixture: SaveFixture, user: User) -> BankAccount:
  bank_account = BankAccount(name="Skandia", currency="SEK", base_balance=0, subtype="checking", user_id=user.id)
  await save_fixture(bank_account)
  return bank_account


async def _transaction(save_fixture: SaveFixture, account: BankAccount, description: str = "Elgiganten") -> Transaction:
  transaction = Transaction(
    amount=129900,
    currency="SEK",
    transaction_date=date(2026, 10, 1),
    direction=TransactionDirection.debit,
    dedup_hash=uuid4().hex,
    description=description,
    bank_account_id=account.id,
    user_id=account.user_id,
  )
  await save_fixture(transaction)
  return transaction


async def _upload(client: AsyncClient, transaction_id: object, content: bytes, filename: str = "faktura.pdf") -> dict:
  response = await client.post(f"/v1/transactions/{transaction_id}/documents", files={"file": (filename, content, "application/octet-stream")})
  assert response.status_code == 201, response.text
  return response.json()


def _stored(document_id: str) -> list[str]:
  folder = Path(settings.FILES_DIR, "documents", document_id)
  return sorted(p.name for p in folder.iterdir()) if folder.exists() else []


class TestTransactionDocuments:
  @pytest.mark.asyncio
  async def test_a_pdf_is_kept_with_previews_of_its_pages_and_downloads_as_uploaded(
    self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount
  ) -> None:
    transaction = await _transaction(save_fixture, account)
    pdf = a_pdf(pages=2)

    document = await _upload(client, transaction.id, pdf, "Faktura oktober.pdf")

    assert (document["content_type"], document["page_count"], document["size_bytes"]) == ("application/pdf", 2, len(pdf))
    assert _stored(document["id"]) == ["original", "page-1.webp", "page-2.webp", "thumbnail.webp"]
    listed = (await client.get(f"/v1/transactions/{transaction.id}/documents")).json()
    assert [d["id"] for d in listed] == [document["id"]]
    download = await client.get(f"/v1/documents/{document['id']}/file")
    assert download.content == pdf
    assert download.headers["content-disposition"] == "attachment; filename*=UTF-8''Faktura%20oktober.pdf"
    assert "sandbox" in download.headers["content-security-policy"]
    page = await client.get(f"/v1/documents/{document['id']}/pages/2")
    assert (page.status_code, page.headers["content-type"], page.content[8:12]) == (200, "image/webp", b"WEBP")
    assert (await client.get(f"/v1/documents/{document['id']}/pages/3")).status_code == 404
    assert (await client.get(f"/v1/documents/{document['id']}/thumbnail")).content[8:12] == b"WEBP"

  @pytest.mark.asyncio
  async def test_a_photos_preview_is_turned_upright_and_says_nothing_of_where_it_was_taken(
    self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount
  ) -> None:
    transaction = await _transaction(save_fixture, account)

    document = await _upload(client, transaction.id, a_phone_photo(), "kvitto.jpg")

    assert (document["content_type"], document["page_count"]) == ("image/jpeg", 1)
    preview = Image.open(io.BytesIO((await client.get(f"/v1/documents/{document['id']}/pages/1")).content))
    assert preview.size == (200, 400)
    assert not preview.getexif()

  @pytest.mark.asyncio
  @pytest.mark.parametrize(
    ("content", "filename"),
    [(b"hello", "notes.txt"), (b"<svg xmlns='http://www.w3.org/2000/svg'/>", "logo.svg"), (b"GIF89a" + b"\0" * 20, "anim.gif")],
  )
  async def test_only_pdfs_and_photos_are_kept(
    self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount, content: bytes, filename: str
  ) -> None:
    transaction = await _transaction(save_fixture, account)

    response = await client.post(f"/v1/transactions/{transaction.id}/documents", files={"file": (filename, content, "application/pdf")})

    assert (response.status_code, response.json()["detail"]) == (400, "Only PDFs and photos (JPEG, PNG, WebP, HEIC) can be added.")

  @pytest.mark.asyncio
  async def test_a_document_comes_off_only_a_transaction_it_belongs_to(self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount) -> None:
    kept, other = await _transaction(save_fixture, account, "Elgiganten"), await _transaction(save_fixture, account, "ICA")
    document = await _upload(client, kept.id, a_pdf(1))

    response = await client.delete(f"/v1/transactions/{other.id}/documents/{document['id']}")

    assert response.status_code == 404
    assert [d["id"] for d in (await client.get(f"/v1/transactions/{kept.id}/documents")).json()] == [document["id"]]

  @pytest.mark.asyncio
  async def test_a_broken_pdf_is_turned_away(self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount) -> None:
    transaction = await _transaction(save_fixture, account)

    response = await client.post(f"/v1/transactions/{transaction.id}/documents", files={"file": ("x.pdf", b"%PDF-1.7 not really", "application/pdf")})

    assert (response.status_code, response.json()["detail"]) == (400, "This PDF couldn't be read.")

  @pytest.mark.asyncio
  async def test_the_same_file_twice_is_one_document_deleted_with_its_last_transaction(
    self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount
  ) -> None:
    first, second = await _transaction(save_fixture, account, "Klarna 1/2"), await _transaction(save_fixture, account, "Klarna 2/2")
    pdf = a_pdf(pages=1)

    one = await _upload(client, first.id, pdf)
    again = await _upload(client, second.id, pdf)
    assert one["id"] == again["id"]

    assert (await client.delete(f"/v1/transactions/{first.id}/documents/{one['id']}")).status_code == 204
    assert (await client.get(f"/v1/transactions/{first.id}/documents")).json() == []
    assert _stored(one["id"]) == ["original", "page-1.webp", "thumbnail.webp"]

    assert (await client.delete(f"/v1/transactions/{second.id}/documents/{one['id']}")).status_code == 204
    assert _stored(one["id"]) == []
    assert (await client.get(f"/v1/documents/{one['id']}/file")).status_code == 404

  @pytest.mark.asyncio
  async def test_the_list_counts_documents_and_finds_those_with_and_without(self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount) -> None:
    with_receipt = await _transaction(save_fixture, account, "Elgiganten")
    await _transaction(save_fixture, account, "ICA")
    await _upload(client, with_receipt.id, a_pdf(1))

    every = (await client.get("/v1/transactions")).json()["items"]
    have = (await client.get("/v1/transactions", params={"has_documents": True})).json()["items"]
    missing = (await client.get("/v1/transactions", params={"has_documents": False})).json()["items"]

    assert {t["description"]: t["document_count"] for t in every} == {"Elgiganten": 1, "ICA": 0}
    assert ([t["description"] for t in have], [t["description"] for t in missing]) == (["Elgiganten"], ["ICA"])

  @pytest.mark.asyncio
  async def test_size_and_storage_limits(self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount, monkeypatch: pytest.MonkeyPatch) -> None:
    transaction = await _transaction(save_fixture, account)
    monkeypatch.setattr(document_endpoints, "MAX_DOCUMENT_BYTES", 100)
    too_big = await client.post(f"/v1/transactions/{transaction.id}/documents", files={"file": ("big.pdf", a_pdf(1), "application/pdf")})
    monkeypatch.setattr(document_endpoints, "MAX_DOCUMENT_BYTES", 20 * 1024 * 1024)
    monkeypatch.setattr(document_service_module, "MAX_DOCUMENT_STORAGE_PER_USER_BYTES", len(a_pdf(1)) + 10)
    await _upload(client, transaction.id, a_pdf(1))
    full = await client.post(f"/v1/transactions/{transaction.id}/documents", files={"file": ("more.pdf", a_pdf(2), "application/pdf")})

    assert (too_big.status_code, full.status_code) == (413, 413)

  @pytest.mark.asyncio
  async def test_another_user_can_neither_see_nor_change_them(
    self, client: AsyncClient, other_client: AsyncClient, save_fixture: SaveFixture, account: BankAccount
  ) -> None:
    transaction = await _transaction(save_fixture, account)
    document = await _upload(client, transaction.id, a_pdf(1))

    responses = [
      await other_client.get(f"/v1/transactions/{transaction.id}/documents"),
      await other_client.post(f"/v1/transactions/{transaction.id}/documents", files={"file": ("x.pdf", a_pdf(1), "application/pdf")}),
      await other_client.delete(f"/v1/transactions/{transaction.id}/documents/{document['id']}"),
      await other_client.get(f"/v1/documents/{document['id']}/file"),
      await other_client.get(f"/v1/documents/{document['id']}/pages/1"),
      await other_client.get(f"/v1/documents/{document['id']}/thumbnail"),
    ]

    assert [r.status_code for r in responses] == [404] * 6
    assert _stored(document["id"]) == ["original", "page-1.webp", "thumbnail.webp"]


class TestFileStorage:
  def test_production_refuses_to_store_files_without_a_bucket(self, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ENV", Environment.production)
    monkeypatch.setattr(settings, "STORAGE_ENDPOINT_URL", "")

    with pytest.raises(storage_module.StorageNotConfiguredError):
      storage_module.file_storage()

  def test_a_configured_bucket_is_used_anywhere(self, monkeypatch: pytest.MonkeyPatch) -> None:
    for name, value in {
      "STORAGE_ENDPOINT_URL": "https://account.r2.cloudflarestorage.com",
      "STORAGE_BUCKET": "bessel",
      "STORAGE_ACCESS_KEY_ID": "key",
      "STORAGE_SECRET_ACCESS_KEY": "secret",
    }.items():
      monkeypatch.setattr(settings, name, value)
    storage_module._bucket.cache_clear()

    assert isinstance(storage_module.file_storage(), storage_module.S3FileStorage)
    storage_module._bucket.cache_clear()

  @pytest.mark.asyncio
  async def test_a_key_never_leaves_the_local_folder(self, tmp_path: Path) -> None:
    storage = storage_module.LocalFileStorage(tmp_path / "files")

    with pytest.raises(ValueError, match="leaves the storage folder"):
      await storage.put("../outside", b"x", "text/plain")

  @pytest.mark.asyncio
  async def test_the_bucket_stores_reads_and_reports_missing_files(self) -> None:
    bucket = storage_module.S3FileStorage(endpoint_url="https://r2.example.com", bucket="bessel", access_key_id="k", secret_access_key="s")
    with Stubber(bucket.client) as stub:
      stub.add_response("put_object", {}, {"Bucket": "bessel", "Key": "documents/1/original", "Body": b"%PDF-", "ContentType": "application/pdf"})
      stub.add_client_error("get_object", service_error_code="NoSuchKey", http_status_code=404)
      await bucket.put("documents/1/original", b"%PDF-", "application/pdf")
      assert await bucket.get("documents/1/missing") is None
      stub.assert_no_pending_responses()
