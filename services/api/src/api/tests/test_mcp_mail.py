from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from email.parser import BytesParser
from email.policy import default
from email.utils import format_datetime, make_msgid
from typing import Any

import pytest
import pytest_asyncio
from api.common.encryption import encrypt
from api.mail import service
from api.mail.mailbox import Criterion, Folder, ImapMailbox, _meta
from api.mail.messages import imap_utf7_decode, imap_utf7_encode, without_quotes
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.user import User
from api.settings import settings
from api.tests.fixtures.database import SaveFixture
from api.tests.fixtures.mcp import ConnectFixture, mcp_call, mcp_call_error
from cryptography.fernet import Fernet

ME = "simon@example.se"
NOW = datetime.now(UTC)
_parse = BytesParser(policy=default)


def mail(
  sender: str,
  subject: str,
  body: str = "Hej",
  *,
  to: str = ME,
  days_ago: float = 1,
  message_id: str | None = None,
  in_reply_to: str | None = None,
  headers: dict[str, str] | None = None,
  html: str | None = None,
  attachment: tuple[str, bytes] | None = None,
) -> bytes:
  message = EmailMessage()
  message["From"] = sender
  message["To"] = to
  message["Subject"] = subject
  message["Date"] = format_datetime(NOW - timedelta(days=days_ago))
  message["Message-ID"] = message_id or make_msgid(domain="mail.test")
  if in_reply_to:
    message["In-Reply-To"] = in_reply_to
    message["References"] = in_reply_to
  for name, value in (headers or {}).items():
    message[name] = value
  message.set_content(body)
  if html:
    message.add_alternative(html, subtype="html")
  if attachment:
    message.add_attachment(attachment[1], maintype="application", subtype="pdf", filename=attachment[0])
  return message.as_bytes()


class FakeMailbox:
  """Folders of raw messages, searched the way IMAP SEARCH does: case-insensitive substrings."""

  def __init__(self, folders: dict[str, list[tuple[bytes, set[str]]]], *, sent_role: bool = True) -> None:
    self.store: dict[str, dict[int, tuple[frozenset[str], bytes]]] = {
      name: {uid: (frozenset(flags), raw) for uid, (raw, flags) in enumerate(messages, start=1)} for name, messages in folders.items()
    }
    self.sent_role = sent_role
    self.appended: list[tuple[str, list[str], bytes]] = []

  def folders(self) -> list[Folder]:
    return [Folder(name, frozenset({"\\Sent"} if name == "Sent Messages" and self.sent_role else set())) for name in self.store]

  def _matches(self, flags: frozenset[str], raw: bytes, criterion: Criterion) -> bool:
    parsed = _parse.parsebytes(raw)
    value = (criterion.value or "").lower()
    match criterion.key:
      case "ALL":
        return True
      case "UNSEEN":
        return "\\Seen" not in flags
      case "FLAGGED":
        return "\\Flagged" in flags
      case "FROM" | "TO" | "SUBJECT":
        return value in str(parsed.get(criterion.key.title()) or "").lower()
      case "TEXT":
        return value in raw.decode(errors="replace").lower()
      case "HEADER":
        name, needle = (criterion.value or "").split(" ", 1)
        return needle.lower() in str(parsed.get(name) or "").lower()
      case "SINCE" | "BEFORE":
        day = datetime.strptime(criterion.value or "", "%d-%b-%Y").date()
        sent = parsed["Date"].datetime.date()
        return sent >= day if criterion.key == "SINCE" else sent < day
    raise AssertionError(criterion)

  def search(self, folder: str, criteria: Sequence[Criterion]) -> list[int]:
    return sorted(
      (uid for uid, (flags, raw) in self.store[folder].items() if all(self._matches(flags, raw, c) for c in criteria)),
      reverse=True,
    )

  def headers(self, folder: str, uids: Sequence[int]) -> list[tuple[int, frozenset[str], bytes]]:
    return [(uid, *self.store[folder][uid]) for uid in uids]

  def fetch(self, folder: str, uid: int) -> tuple[frozenset[str], bytes] | None:
    return self.store[folder].get(uid)

  def append(self, folder: str, flags: Sequence[str], raw: bytes) -> None:
    self.appended.append((folder, list(flags), raw))


@pytest.fixture(autouse=True)
def encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())


@pytest.fixture
def mailbox(monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, Any]]:
  """Set `box["mailbox"]` in a test; the tools open it as the user's iCloud Mail."""
  holder: dict[str, Any] = {}
  signed_in: list[tuple[str, str]] = []

  @contextmanager
  def open_mailbox(username: str, password: str) -> Iterator[FakeMailbox]:
    signed_in.append((username, password))
    yield holder["mailbox"]

  holder["signed_in"] = signed_in
  monkeypatch.setattr(service.mail_service, "open_mailbox", open_mailbox)
  yield holder


@pytest_asyncio.fixture
async def icloud(save_fixture: SaveFixture, user: User) -> None:
  await save_fixture(CalendarAccount(user_id=user.id, provider=CalendarProvider.icloud, email=ME, encrypted_credentials=encrypt("app-password")))


def drafts(box: FakeMailbox) -> list[EmailMessage]:
  return [_parse.parsebytes(raw) for _, _, raw in box.appended]  # type: ignore[misc]


@pytest.mark.usefixtures("icloud")
class TestSearch:
  @pytest.mark.asyncio
  async def test_newest_first_and_every_condition_must_hold(self, connect: ConnectFixture, mailbox: dict[str, Any]) -> None:
    mailbox["mailbox"] = FakeMailbox(
      {
        "INBOX": [
          (mail("Anna <anna@x.se>", "Faktura oktober", days_ago=3), {"\\Seen"}),
          (mail("Anna <anna@x.se>", "Middag?", days_ago=2), set()),
          (mail("Bo <bo@y.se>", "Faktura från Bo", days_ago=1), set()),
        ]
      }
    )

    newest = await mcp_call(connect, "search_emails", {})
    from_anna = await mcp_call(connect, "search_emails", {"sender": "anna", "subject": "faktura"})
    unread = await mcp_call(connect, "search_emails", {"unread": True, "limit": 1})

    assert [e["subject"] for e in newest["emails"]] == ["Faktura från Bo", "Middag?", "Faktura oktober"]
    assert [e["subject"] for e in from_anna["emails"]] == ["Faktura oktober"]
    assert [(e["subject"], e["unread"]) for e in unread["emails"]] == [("Faktura från Bo", True)]
    assert mailbox["signed_in"][0] == (ME, "app-password")

  @pytest.mark.asyncio
  async def test_days_are_read_in_the_users_timezone(self, connect: ConnectFixture, mailbox: dict[str, Any]) -> None:
    mailbox["mailbox"] = FakeMailbox({"INBOX": [(mail("a@x.se", "Gammal", days_ago=10), set()), (mail("a@x.se", "Ny", days_ago=1), set())]})

    found = await mcp_call(connect, "search_emails", {"since": (NOW - timedelta(days=5)).date().isoformat(), "timezone": "UTC"})

    assert [e["subject"] for e in found["emails"]] == ["Ny"]

  @pytest.mark.asyncio
  async def test_without_icloud_connected_it_says_how_to_connect(self, connect: ConnectFixture, mailbox: dict[str, Any]) -> None:
    error = await mcp_call_error(connect, "search_emails", {}, token="token-b")

    assert "connect it in Bessel" in error


@pytest.mark.usefixtures("icloud")
class TestRead:
  @pytest.mark.asyncio
  async def test_html_mail_comes_as_text_with_its_attachments(self, connect: ConnectFixture, mailbox: dict[str, Any]) -> None:
    newsletter = mail(
      "Nyheter <news@shop.se>",
      "Rea",
      "",
      html="<html><head><style>p{}</style></head><body><p>Allt <b>50%</b></p></body></html>",
      headers={"List-Unsubscribe": "<mailto:stop@shop.se>"},
      attachment=("villkor.pdf", b"%PDF-1.4 fake"),
    )
    mailbox["mailbox"] = FakeMailbox({"INBOX": [(newsletter, set())]})

    found = await mcp_call(connect, "read_email", {"uid": 1})

    assert "Allt" in found["text"] and "50%" in found["text"] and "p{}" not in found["text"]
    assert found["automated"] is True
    assert [(a["name"], a["content_type"]) for a in found["attachments"]] == [("villkor.pdf", "application/pdf")]

  @pytest.mark.asyncio
  async def test_a_missing_message_is_an_error(self, connect: ConnectFixture, mailbox: dict[str, Any]) -> None:
    mailbox["mailbox"] = FakeMailbox({"INBOX": []})

    assert "No message 7" in await mcp_call_error(connect, "read_email", {"uid": 7})


@pytest.mark.usefixtures("icloud")
class TestThread:
  @pytest.mark.asyncio
  async def test_the_conversation_from_both_folders_oldest_first_without_quotes(self, connect: ConnectFixture, mailbox: dict[str, Any]) -> None:
    mailbox["mailbox"] = FakeMailbox(
      {
        "INBOX": [
          (mail("anna@x.se", "Middag", "Ses vi fredag?", days_ago=3, message_id="<m1@x.se>"), set()),
          (
            mail("anna@x.se", "Re: Middag", "Bra, 19 då!\n\nOn Tue, Simon wrote:\n> Gärna", days_ago=1, message_id="<m3@x.se>", in_reply_to="<m2@me.se>"),
            set(),
          ),
          (mail("bo@y.se", "Annat", days_ago=1), set()),
        ],
        "Sent Messages": [
          (mail(ME, "Re: Middag", "Gärna\n> Ses vi fredag?", to="anna@x.se", days_ago=2, message_id="<m2@me.se>", in_reply_to="<m1@x.se>"), set())
        ],
      }
    )

    found = await mcp_call(connect, "read_thread", {"uid": 2})

    assert [(e["folder"], e["text"]) for e in found["emails"]] == [
      ("INBOX", "Ses vi fredag?"),
      ("Sent Messages", "Gärna"),
      ("INBOX", "Bra, 19 då!"),
    ]


@pytest.mark.usefixtures("icloud")
class TestOwedReplies:
  @pytest.mark.asyncio
  async def test_only_people_still_waiting_on_you(self, connect: ConnectFixture, mailbox: dict[str, Any]) -> None:
    mailbox["mailbox"] = FakeMailbox(
      {
        "INBOX": [
          (mail("anna@x.se", "Fråga 1", days_ago=4), set()),
          (mail("anna@x.se", "Fråga 2", days_ago=2), set()),
          (mail("bo@y.se", "Svarad i tråden", days_ago=3, message_id="<bo@y.se>"), set()),
          (mail("cia@z.se", "Svarad med nytt mejl", days_ago=3), set()),
          (mail("news@shop.se", "Rea", days_ago=1, headers={"List-Id": "shop"}), set()),
          (mail("noreply@bank.se", "Kod", days_ago=1), set()),
          (mail(ME, "Till mig själv", days_ago=1), set()),
          (mail("old@w.se", "Gammalt", days_ago=20), set()),
        ],
        "Sent Messages": [
          (mail(ME, "Re: Svarad i tråden", to="bo.team@y.se", days_ago=2, in_reply_to="<bo@y.se>"), set()),
          (mail(ME, "Hej Cia", to="cia@z.se", days_ago=1), set()),
          (mail(ME, "Tidigt till Anna", to="anna@x.se", days_ago=5), set()),
        ],
      }
    )

    found = await mcp_call(connect, "owed_replies", {"days": 7})

    assert [(e["sender"]["address"], e["subject"]) for e in found["emails"]] == [("anna@x.se", "Fråga 2")]


@pytest.mark.usefixtures("icloud")
class TestDrafts:
  @pytest.mark.asyncio
  async def test_a_new_draft_is_saved_never_sent(self, connect: ConnectFixture, mailbox: dict[str, Any]) -> None:
    box = FakeMailbox({"INBOX": [], "Drafts": [], "Sent Messages": []})
    mailbox["mailbox"] = box

    saved = await mcp_call(connect, "draft_email", {"to": ["anna@x.se"], "cc": ["bo@y.se"], "subject": "Middag", "body": "Fredag 19?"})

    assert saved == {"folder": "Drafts", "subject": "Middag"}
    [(folder, flags, _)] = box.appended
    [draft] = drafts(box)
    assert (folder, flags) == ("Drafts", ["\\Draft", "\\Seen"])
    assert (draft["From"], draft["To"], draft["Cc"]) == (ME, "anna@x.se", "bo@y.se")
    assert draft.get_content().strip() == "Fredag 19?"

  @pytest.mark.asyncio
  async def test_a_reply_lands_in_the_thread_and_quotes_the_original(self, connect: ConnectFixture, mailbox: dict[str, Any]) -> None:
    original = mail(
      "Anna <anna@x.se>",
      "Middag",
      "Ses vi fredag?",
      to=f"{ME}, bo@y.se",
      message_id="<m1@x.se>",
      headers={"Cc": "cia@z.se", "Reply-To": "anna.privat@x.se"},
    )
    box = FakeMailbox({"INBOX": [(original, set())], "Drafts": [], "Sent Messages": []})
    mailbox["mailbox"] = box

    await mcp_call(connect, "draft_reply", {"uid": 1, "body": "Gärna!"})
    await mcp_call(connect, "draft_reply", {"uid": 1, "body": "Alla välkomna", "reply_all": True})

    only, everyone = drafts(box)
    assert (only["Subject"], only["To"], only["In-Reply-To"], only["References"]) == ("Re: Middag", "anna.privat@x.se", "<m1@x.se>", "<m1@x.se>")
    assert only["Cc"] is None
    assert "Gärna!" in only.get_content() and "> Ses vi fredag?" in only.get_content()
    assert everyone["Cc"] == "bo@y.se, cia@z.se"

  @pytest.mark.asyncio
  async def test_drafts_are_found_by_name_and_sent_by_role(self, connect: ConnectFixture, mailbox: dict[str, Any]) -> None:
    box = FakeMailbox({"INBOX": [], "drafts": [], "Sent Messages": []})
    mailbox["mailbox"] = box

    saved = await mcp_call(connect, "draft_email", {"to": ["anna@x.se"], "subject": "Hej", "body": "Hej"})

    assert saved["folder"] == "drafts"


class TestIsolation:
  @pytest.mark.asyncio
  async def test_every_mail_tool_signs_in_as_the_caller_only(
    self, connect: ConnectFixture, mailbox: dict[str, Any], save_fixture: SaveFixture, user: User, other_user: User
  ) -> None:
    await save_fixture(CalendarAccount(user_id=user.id, provider=CalendarProvider.icloud, email=ME, encrypted_credentials=encrypt("mine")))
    await save_fixture(
      CalendarAccount(user_id=other_user.id, provider=CalendarProvider.icloud, email="other@example.se", encrypted_credentials=encrypt("theirs"))
    )
    mailbox["mailbox"] = FakeMailbox({"INBOX": [(mail("anna@x.se", "Hej"), set())], "Drafts": [], "Sent Messages": []})
    calls = {
      "list_mail_folders": {},
      "search_emails": {},
      "read_email": {"uid": 1},
      "read_thread": {"uid": 1},
      "owed_replies": {},
      "draft_email": {"to": ["anna@x.se"], "subject": "Hej", "body": "Hej"},
      "draft_reply": {"uid": 1, "body": "Hej"},
    }

    for tool, arguments in calls.items():
      await mcp_call(connect, tool, arguments, token="token-b")

    assert {username for username, _ in mailbox["signed_in"]} == {"other@example.se"}
    assert {password for _, password in mailbox["signed_in"]} == {"theirs"}
    assert len(mailbox["signed_in"]) == len(calls)


class TestImapDetails:
  def test_folder_names_round_trip_through_imap_utf7(self) -> None:
    assert imap_utf7_decode("Fo&Awg-retag") == "Företag"
    assert imap_utf7_encode("Företag") == "F&APY-retag"
    assert imap_utf7_encode("R&D") == "R&-D"
    assert imap_utf7_decode(imap_utf7_encode("Kvitton & räkningar 2026")) == "Kvitton & räkningar 2026"

  def test_a_typed_folder_name_opens_the_servers_own_spelling(self) -> None:
    box = ImapMailbox("me", "secret")
    box._server_names = {"Företag": "Fo&Awg-retag"}

    assert box._server_name("Företag") == "Fo&Awg-retag"
    assert box._server_name("inbox") == "INBOX"
    assert box._server_name("Ny mapp") == "Ny mapp"

  def test_fetch_responses_give_the_uid_and_flags(self) -> None:
    assert _meta(b"3 (UID 812 FLAGS (\\Seen \\Flagged) BODY[] {120}") == (812, frozenset({"\\Seen", "\\Flagged"}))

  def test_quoted_history_is_cut_from_a_reply(self) -> None:
    assert without_quotes("Ja!\n\nDen tis 3 nov. 2026 skrev Anna:\n> Kan du?") == "Ja!"
    assert without_quotes("Ok\n> tidigare\nmer") == "Ok\nmer"
