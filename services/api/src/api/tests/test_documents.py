import io
from datetime import date
from pathlib import Path
from uuid import UUID, uuid4

import pypdfium2
import pytest
import pytest_asyncio
from api.common import file_storage as storage_module
from api.documents import endpoints as document_endpoints
from api.documents import previews as previews_module
from api.documents import service as document_service_module
from api.documents.repository import DocumentRepository
from api.models.bank_account import BankAccount
from api.models.document import Document
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.settings import Environment, settings
from api.tests.fixtures.database import SaveFixture
from botocore.exceptions import ClientError
from botocore.response import StreamingBody
from botocore.stub import Stubber
from httpx import AsyncClient
from PIL import Image


def a_pdf(pages: int = 2, *, width: float = 595, height: float = 842) -> bytes:
  pdf = pypdfium2.PdfDocument.new()
  for _ in range(pages):
    pdf.new_page(width, height)
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


async def _transaction(
  save_fixture: SaveFixture,
  account: BankAccount,
  description: str = "Elgiganten",
  direction: TransactionDirection = TransactionDirection.debit,
  **fields: object,
) -> Transaction:
  transaction = Transaction(
    amount=129900,
    currency="SEK",
    transaction_date=date(2026, 10, 1),
    direction=direction,
    dedup_hash=uuid4().hex,
    description=description,
    bank_account_id=account.id,
    user_id=account.user_id,
    **fields,
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
  async def test_the_list_counts_documents_and_finds_purchases_still_missing_one(
    self, client: AsyncClient, save_fixture: SaveFixture, user: User, account: BankAccount
  ) -> None:
    isk = BankAccount(name="ISK", currency="SEK", base_balance=0, subtype="isk", user_id=user.id)
    await save_fixture(isk)
    with_receipt = await _transaction(save_fixture, account, "Elgiganten")
    await _transaction(save_fixture, account, "ICA")
    await _transaction(save_fixture, account, "Lön", TransactionDirection.credit)
    await _transaction(save_fixture, account, "Till sparkonto", transfer_id=uuid4())
    await _transaction(save_fixture, isk, "Riskpremie")
    await _upload(client, with_receipt.id, a_pdf(1))

    every = (await client.get("/v1/transactions")).json()["items"]
    missing = (await client.get("/v1/transactions", params={"missing_documents": True})).json()["items"]

    assert {t["description"]: t["document_count"] for t in every} == {"Elgiganten": 1, "ICA": 0, "Lön": 0, "Till sparkonto": 0, "Riskpremie": 0}
    assert [t["description"] for t in missing] == ["ICA"]

  @pytest.mark.asyncio
  async def test_a_file_over_the_size_limit_is_turned_away(
    self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount, monkeypatch: pytest.MonkeyPatch
  ) -> None:
    transaction = await _transaction(save_fixture, account)
    monkeypatch.setattr(document_endpoints, "MAX_DOCUMENT_BYTES", len(a_pdf(1)) - 1)

    response = await client.post(f"/v1/transactions/{transaction.id}/documents", files={"file": ("big.pdf", a_pdf(1), "application/pdf")})

    assert (response.status_code, response.json()["detail"]) == (413, "The file is too large (max 20 MB).")

  @pytest.mark.asyncio
  async def test_storage_fills_up_to_the_byte_and_a_file_already_kept_never_counts_twice(
    self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount, monkeypatch: pytest.MonkeyPatch
  ) -> None:
    first, second = await _transaction(save_fixture, account, "Elgiganten"), await _transaction(save_fixture, account, "ICA")
    one, two = a_pdf(1), a_pdf(2)
    monkeypatch.setattr(document_service_module, "MAX_DOCUMENT_STORAGE_PER_USER_BYTES", len(one) + len(two))

    await _upload(client, first.id, one)
    exactly_full = await client.post(f"/v1/transactions/{first.id}/documents", files={"file": ("two.pdf", two, "application/pdf")})
    over = await client.post(f"/v1/transactions/{first.id}/documents", files={"file": ("three.pdf", a_pdf(3), "application/pdf")})
    kept_again = await client.post(f"/v1/transactions/{second.id}/documents", files={"file": ("one.pdf", one, "application/pdf")})

    assert exactly_full.status_code == 201
    assert (over.status_code, over.json()["detail"]) == (413, "Storage for invoices and receipts is full (2 GB).")
    assert kept_again.status_code == 201

  @pytest.mark.asyncio
  async def test_a_long_pdf_keeps_its_page_count_with_previews_of_the_first_twenty(
    self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount
  ) -> None:
    transaction = await _transaction(save_fixture, account)

    document = await _upload(client, transaction.id, a_pdf(21))

    assert (document["page_count"], document["preview_pages"]) == (21, 20)
    assert _stored(document["id"]) == sorted(["original", "thumbnail.webp", *(f"page-{n}.webp" for n in range(1, 21))])

  @pytest.mark.asyncio
  async def test_a_page_too_tall_to_draw_whole_is_drawn_smaller(self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount) -> None:
    transaction = await _transaction(save_fixture, account)

    document = await _upload(client, transaction.id, a_pdf(1, width=10, height=14400))

    preview = Image.open(io.BytesIO((await client.get(f"/v1/documents/{document['id']}/pages/1")).content))
    assert preview.height <= previews_module.MAX_PAGE_SIDE
    assert preview.width * preview.height <= previews_module.MAX_PAGE_PIXELS

  @pytest.mark.asyncio
  async def test_the_same_file_uploaded_at_the_same_moment_is_linked_not_refused(
    self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount, monkeypatch: pytest.MonkeyPatch
  ) -> None:
    first, second = await _transaction(save_fixture, account, "Klarna 1/2"), await _transaction(save_fixture, account, "Klarna 2/2")
    pdf = a_pdf(1)
    kept = await _upload(client, first.id, pdf)
    found = DocumentRepository.get_by_checksum
    misses = iter([True])

    # The other request's row isn't there yet when this one looks, only when it inserts.
    async def racing(self: DocumentRepository, user_id: UUID, sha256: str) -> Document | None:
      return None if next(misses, False) else await found(self, user_id, sha256)

    monkeypatch.setattr(DocumentRepository, "get_by_checksum", racing)
    response = await client.post(f"/v1/transactions/{second.id}/documents", files={"file": ("same.pdf", pdf, "application/pdf")})

    assert (response.status_code, response.json()["id"]) == (201, kept["id"])
    assert [d["id"] for d in (await client.get(f"/v1/transactions/{second.id}/documents")).json()] == [kept["id"]]

  @pytest.mark.asyncio
  async def test_deleting_transactions_deletes_documents_left_without_one_and_keeps_shared_ones(
    self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount
  ) -> None:
    only, shared_a, shared_b = [await _transaction(save_fixture, account, name) for name in ("Elgiganten", "Klarna 1/2", "Klarna 2/2")]
    alone = await _upload(client, only.id, a_pdf(1))
    both = a_pdf(2)
    shared = await _upload(client, shared_a.id, both)
    await _upload(client, shared_b.id, both)

    response = await client.request("DELETE", "/v1/transactions", json={"ids": [str(only.id), str(shared_a.id)]})

    assert response.status_code == 204
    assert (_stored(alone["id"]), (await client.get(f"/v1/documents/{alone['id']}/file")).status_code) == ([], 404)
    assert _stored(shared["id"]) == ["original", "page-1.webp", "page-2.webp", "thumbnail.webp"]

  @pytest.mark.asyncio
  async def test_deleting_an_account_deletes_its_documents(self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount) -> None:
    transaction = await _transaction(save_fixture, account)
    document = await _upload(client, transaction.id, a_pdf(1))

    response = await client.delete(f"/v1/bank-accounts/{account.id}")

    assert response.status_code == 204
    assert (_stored(document["id"]), (await client.get(f"/v1/documents/{document['id']}/file")).status_code) == ([], 404)

  @pytest.mark.asyncio
  async def test_an_edited_transaction_still_counts_its_documents(self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount) -> None:
    transaction = await _transaction(save_fixture, account)
    await _upload(client, transaction.id, a_pdf(1))

    noted = await client.patch(f"/v1/transactions/{transaction.id}", json={"note": "Lampan"})
    renamed = await client.put(f"/v1/transactions/{transaction.id}/name", json={"name": "Elgiganten Kungens kurva"})

    assert (noted.json()["document_count"], renamed.json()["document_count"]) == (1, 1)

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

  @pytest.mark.asyncio
  async def test_the_same_file_from_another_user_is_their_own_document(
    self, client: AsyncClient, other_client: AsyncClient, save_fixture: SaveFixture, account: BankAccount, other_user: User
  ) -> None:
    transaction = await _transaction(save_fixture, account)
    theirs = BankAccount(name="B", currency="SEK", base_balance=0, subtype="checking", user_id=other_user.id)
    await save_fixture(theirs)
    their_transaction = await _transaction(save_fixture, theirs)
    pdf = a_pdf(1)
    mine = await _upload(client, transaction.id, pdf, "mine.pdf")

    their = await _upload(other_client, their_transaction.id, pdf, "theirs.pdf")

    assert their["id"] != mine["id"]
    assert their["filename"] == "theirs.pdf"
    assert [d["filename"] for d in (await client.get(f"/v1/transactions/{transaction.id}/documents")).json()] == ["mine.pdf"]


class TestFileStorage:
  @pytest.mark.asyncio
  async def test_production_refuses_to_store_files_without_a_bucket_but_still_reads_and_deletes(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "ENV", Environment.production)
    monkeypatch.setattr(settings, "STORAGE_ENDPOINT_URL", "")
    monkeypatch.setattr(settings, "FILES_DIR", str(tmp_path))
    (tmp_path / "left-behind").write_bytes(b"x")
    storage = storage_module.file_storage()

    with pytest.raises(storage_module.StorageNotConfiguredError):
      await storage.put("receipt", b"x", "image/png")
    assert await storage.get("left-behind") is None
    await storage.delete("left-behind")
    assert (tmp_path / "left-behind").exists()

  @pytest.mark.parametrize("env", [Environment.production, Environment.development])
  def test_a_configured_bucket_is_used_in_production_and_development(self, monkeypatch: pytest.MonkeyPatch, env: Environment) -> None:
    monkeypatch.setattr(settings, "ENV", env)
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
      stub.add_response("get_object", {"Body": StreamingBody(io.BytesIO(b"%PDF-"), 5)}, {"Bucket": "bessel", "Key": "documents/1/original"})
      stub.add_client_error(
        "get_object", service_error_code="NoSuchKey", http_status_code=404, expected_params={"Bucket": "bessel", "Key": "documents/1/missing"}
      )
      stub.add_response("delete_object", {}, {"Bucket": "bessel", "Key": "documents/1/original"})
      await bucket.put("documents/1/original", b"%PDF-", "application/pdf")
      assert await bucket.get("documents/1/original") == b"%PDF-"
      assert await bucket.get("documents/1/missing") is None
      await bucket.delete("documents/1/original")
      stub.assert_no_pending_responses()

  @pytest.mark.asyncio
  async def test_a_bucket_error_other_than_a_missing_file_is_raised(self) -> None:
    bucket = storage_module.S3FileStorage(endpoint_url="https://r2.example.com", bucket="bessel", access_key_id="k", secret_access_key="s")
    with Stubber(bucket.client) as stub:
      stub.add_client_error("get_object", service_error_code="AccessDenied", http_status_code=403)
      with pytest.raises(ClientError, match="AccessDenied"):
        await bucket.get("documents/1/original")
