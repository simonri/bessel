"""Reading mail into plain structures, and building drafts. No network here."""

import base64
import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import format_datetime, getaddresses, make_msgid, parsedate_to_datetime

from bs4 import BeautifulSoup

MAX_TEXT_CHARS = 20_000
MAX_QUOTED_LINES = 40
# Mail that no person wrote: lists, notifications, receipts.
_NO_REPLY = re.compile(r"^(no-?reply|do-?not-?reply|notifications?|mailer-daemon|postmaster|bounces?)\b", re.IGNORECASE)
# Where a reply's own text ends and the quoted conversation begins.
_QUOTE_HEADER = re.compile(r"^(On .+ wrote:|Den .+ skrev.*:|-----\s*Original Message\s*-----|From: .+)$")

HEADER_FIELDS = (
  "FROM",
  "TO",
  "CC",
  "REPLY-TO",
  "SUBJECT",
  "DATE",
  "MESSAGE-ID",
  "IN-REPLY-TO",
  "REFERENCES",
  "LIST-UNSUBSCRIBE",
  "LIST-ID",
  "AUTO-SUBMITTED",
  "PRECEDENCE",
)

_parser = BytesParser(policy=policy.default)


@dataclass(frozen=True)
class Address:
  name: str | None
  address: str


@dataclass(frozen=True)
class Attachment:
  name: str | None
  content_type: str
  size: int


@dataclass(frozen=True)
class Envelope:
  """What the headers say about one message."""

  folder: str
  uid: int
  subject: str
  sender: Address | None
  to: list[Address]
  cc: list[Address]
  reply_to: list[Address]
  date: datetime | None
  message_id: str | None
  in_reply_to: str | None
  references: list[str]
  automated: bool
  unread: bool
  flagged: bool


@dataclass(frozen=True)
class Message:
  envelope: Envelope
  text: str
  truncated: bool
  attachments: list[Attachment] = field(default_factory=list)


def _addresses(value: str | None) -> list[Address]:
  return [Address(name or None, address.lower()) for name, address in getaddresses([value or ""]) if address]


def _ids(value: str | None) -> list[str]:
  return re.findall(r"<[^<>\s]+>", value or "")


def _date(value: str | None) -> datetime | None:
  if not value:
    return None
  try:
    parsed = parsedate_to_datetime(value)
  except (TypeError, ValueError):
    return None
  return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def envelope(folder: str, uid: int, flags: frozenset[str], raw_headers: bytes) -> Envelope:
  headers = _parser.parsebytes(raw_headers, headersonly=True)
  sender = next(iter(_addresses(headers.get("From"))), None)
  auto_submitted = (headers.get("Auto-Submitted") or "no").strip().lower()
  precedence = (headers.get("Precedence") or "").strip().lower()
  automated = (
    headers.get("List-Unsubscribe") is not None
    or headers.get("List-Id") is not None
    or auto_submitted != "no"
    or precedence in {"bulk", "list", "junk"}
    or (sender is not None and _NO_REPLY.match(sender.address) is not None)
  )
  return Envelope(
    folder=folder,
    uid=uid,
    subject=str(headers.get("Subject") or "").strip(),
    sender=sender,
    to=_addresses(headers.get("To")),
    cc=_addresses(headers.get("Cc")),
    reply_to=_addresses(headers.get("Reply-To")),
    date=_date(headers.get("Date")),
    message_id=next(iter(_ids(headers.get("Message-ID"))), None),
    in_reply_to=next(iter(_ids(headers.get("In-Reply-To"))), None),
    references=_ids(headers.get("References")),
    automated=automated,
    unread="\\Seen" not in flags,
    flagged="\\Flagged" in flags,
  )


def _html_text(html: str) -> str:
  soup = BeautifulSoup(html, "html.parser")
  for hidden in soup(["script", "style", "head"]):
    hidden.decompose()
  return re.sub(r"\n{3,}", "\n\n", soup.get_text("\n")).strip()


def message(folder: str, uid: int, flags: frozenset[str], raw: bytes) -> Message:
  parsed = _parser.parsebytes(raw)
  plain = parsed.get_body(preferencelist=("plain",))
  text = plain.get_content().strip() if plain is not None else ""
  if not text:
    # Some mail carries an empty plain part beside the real HTML one.
    html = parsed.get_body(preferencelist=("html",))
    text = _html_text(html.get_content()) if html is not None else ""
  attachments = [Attachment(part.get_filename(), part.get_content_type(), len(part.get_payload(decode=True) or b"")) for part in parsed.iter_attachments()]
  return Message(
    envelope=envelope(folder, uid, flags, raw),
    text=text[:MAX_TEXT_CHARS],
    truncated=len(text) > MAX_TEXT_CHARS,
    attachments=attachments,
  )


def without_quotes(text: str) -> str:
  """A reply's own words: the quoted conversation under it is in the earlier messages already."""
  own: list[str] = []
  for line in text.splitlines():
    if _QUOTE_HEADER.match(line.strip()):
      break
    if not line.lstrip().startswith(">"):
      own.append(line)
  return "\n".join(own).strip()


def _subject_reply(subject: str) -> str:
  return subject if re.match(r"^\s*(re|sv|aw)\s*:", subject, re.IGNORECASE) else f"Re: {subject}".strip()


def _format(addresses: Sequence[Address]) -> str:
  return ", ".join(f'"{a.name}" <{a.address}>' if a.name else a.address for a in addresses)


def draft(sender: str, to: Sequence[str], subject: str, body: str, *, cc: Sequence[str] = (), now: datetime) -> EmailMessage:
  mail = EmailMessage()
  mail["From"] = sender
  mail["To"] = ", ".join(to)
  if cc:
    mail["Cc"] = ", ".join(cc)
  mail["Subject"] = subject
  mail["Date"] = format_datetime(now)
  mail["Message-ID"] = make_msgid(domain=sender.rsplit("@", 1)[-1])
  mail.set_content(body)
  return mail


def reply_draft(sender: str, own_addresses: frozenset[str], original: Message, body: str, *, reply_all: bool, now: datetime) -> EmailMessage:
  """A reply in the original's thread, quoting it the way mail apps do."""
  head = original.envelope
  to = head.reply_to or ([head.sender] if head.sender else [])
  cc: list[Address] = []
  if reply_all:
    seen = {a.address for a in to} | own_addresses
    for address in [*head.to, *head.cc]:
      if address.address not in seen:
        cc.append(address)
        seen.add(address.address)
  quoted = "\n".join(f"> {line}" for line in original.text.splitlines()[:MAX_QUOTED_LINES])
  who = (head.sender.name or head.sender.address) if head.sender else "someone"
  when = format_datetime(head.date) if head.date else "earlier"
  mail = draft(
    sender,
    [_format(to)] if to else [],
    _subject_reply(head.subject),
    f"{body.rstrip()}\n\nOn {when}, {who} wrote:\n{quoted}\n",
    cc=[_format(cc)] if cc else [],
    now=now,
  )
  if head.message_id:
    mail["In-Reply-To"] = head.message_id
    mail["References"] = " ".join([*head.references, head.message_id])
  return mail


def imap_utf7_decode(name: str) -> str:
  """IMAP folder names are modified UTF-7 (RFC 3501): "Fo&Awg-retag" is "Företag", composed the way it would be typed."""

  def decode(match: re.Match[str]) -> str:
    chunk = match.group(1)
    if not chunk:
      return "&"
    padded = chunk.replace(",", "/") + "=" * (-len(chunk) % 4)
    return base64.b64decode(padded).decode("utf-16-be")

  return unicodedata.normalize("NFC", re.sub(r"&([^-]*)-", decode, name))


def imap_utf7_encode(name: str) -> str:
  out: list[str] = []
  pending: list[str] = []

  def flush() -> None:
    if pending:
      encoded = base64.b64encode("".join(pending).encode("utf-16-be")).decode().rstrip("=").replace("/", ",")
      out.append(f"&{encoded}-")
      pending.clear()

  for char in name:
    if 0x20 <= ord(char) <= 0x7E:
      flush()
      out.append("&-" if char == "&" else char)
    else:
      pending.append(char)
  flush()
  return "".join(out)
