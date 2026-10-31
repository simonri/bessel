"""A mailbox reached over IMAP: folders, search, fetch and append. Blocking; callers run it in a thread.

Reads use BODY.PEEK, so nothing is marked as read, and nothing here deletes, moves or sends.
"""

import imaplib
import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any, Protocol, Self

from api.mail.messages import HEADER_FIELDS, imap_utf7_decode, imap_utf7_encode

ICLOUD_IMAP_HOST = "imap.mail.me.com"
IMAP_TIMEOUT_SECONDS = 20
_LIST_LINE = re.compile(rb'^\((?P<flags>[^)]*)\) (?:"[^"]*"|NIL) (?P<name>.+)$')
_FETCH_META = re.compile(rb"UID (\d+)|FLAGS \(([^)]*)\)")


@dataclass(frozen=True)
class Criterion:
  """One IMAP SEARCH key, e.g. Criterion("FROM", "anna") or Criterion("UNSEEN")."""

  key: str
  value: str | None = None


@dataclass(frozen=True)
class Folder:
  name: str
  flags: frozenset[str]


class MailboxError(Exception):
  pass


class Mailbox(Protocol):
  def folders(self) -> list[Folder]: ...

  def search(self, folder: str, criteria: Sequence[Criterion]) -> list[int]: ...

  def headers(self, folder: str, uids: Sequence[int]) -> list[tuple[int, frozenset[str], bytes]]: ...

  def fetch(self, folder: str, uid: int) -> tuple[frozenset[str], bytes] | None: ...

  def append(self, folder: str, flags: Sequence[str], raw: bytes) -> None: ...


def imap_date(day: date) -> str:
  return day.strftime("%d-%b-%Y")


def _quote(value: str) -> str:
  return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


class ImapMailbox:
  def __init__(self, username: str, password: str, host: str = ICLOUD_IMAP_HOST) -> None:
    self._username = username
    self._password = password
    self._host = host
    self._conn: imaplib.IMAP4_SSL | None = None
    self._selected: str | None = None
    self._server_names: dict[str, str] = {}

  def __enter__(self) -> Self:
    try:
      self._conn = imaplib.IMAP4_SSL(self._host, 993, timeout=IMAP_TIMEOUT_SECONDS)
      self._conn.login(self._username, self._password)
    except imaplib.IMAP4.error as error:
      raise MailboxError(f"iCloud Mail refused the sign-in: {error}") from error
    except OSError as error:
      raise MailboxError(f"Couldn't reach iCloud Mail: {error}") from error
    return self

  def __exit__(self, *_: object) -> None:
    if self._conn is not None:
      try:
        self._conn.logout()
      except (imaplib.IMAP4.error, OSError):
        pass

  @property
  def conn(self) -> imaplib.IMAP4_SSL:
    assert self._conn is not None, "use the mailbox as a context manager"
    return self._conn

  def _check(self, result: tuple[str, Sequence[Any]], action: str) -> Sequence[Any]:
    status, data = result
    if status != "OK":
      raise MailboxError(f"iCloud Mail couldn't {action}: {data}")
    return data

  def _server_name(self, folder: str) -> str:
    """The name exactly as the server has it: iCloud keeps "Företag" decomposed, which a typed name isn't."""
    if folder.upper() == "INBOX":
      return "INBOX"
    if not self._server_names:
      self.folders()
    return self._server_names.get(unicodedata.normalize("NFC", folder), imap_utf7_encode(folder))

  def _select(self, folder: str) -> None:
    if self._selected != folder:
      self._check(self.conn.select(_quote(self._server_name(folder)), readonly=True), f"open {folder}")
      self._selected = folder

  def folders(self) -> list[Folder]:
    found: list[Folder] = []
    for line in self._check(self.conn.list(), "list folders"):
      match = _LIST_LINE.match(line) if isinstance(line, bytes) else None
      if match:
        raw = match.group("name").decode().strip('"')
        name = imap_utf7_decode(raw)
        self._server_names[name] = raw
        found.append(Folder(name, frozenset(match.group("flags").decode().split())))
    return found

  def _search_one(self, criterion: Criterion) -> set[int]:
    args: list[str] = [criterion.key]
    if criterion.value is not None:
      if criterion.value.isascii():
        args.append(_quote(criterion.value))
      else:
        # Only ASCII travels in the command itself; the rest goes as a literal, which must come last.
        self.conn.literal = criterion.value.encode()  # type: ignore[assignment]
        args = ["CHARSET", "UTF-8", criterion.key]
    data = self._check(self.conn.uid("SEARCH", *args), "search")
    return {int(uid) for uid in (data[0] or b"").split()} if data and isinstance(data[0], bytes) else set()

  def search(self, folder: str, criteria: Sequence[Criterion]) -> list[int]:
    """UIDs matching every criterion, newest first. One SEARCH per criterion, so each can carry its own literal."""
    self._select(folder)
    found: set[int] | None = None
    for criterion in criteria or [Criterion("ALL")]:
      matches = self._search_one(criterion)
      found = matches if found is None else found & matches
    return sorted(found or set(), reverse=True)

  def headers(self, folder: str, uids: Sequence[int]) -> list[tuple[int, frozenset[str], bytes]]:
    if not uids:
      return []
    self._select(folder)
    spec = f"(UID FLAGS BODY.PEEK[HEADER.FIELDS ({' '.join(HEADER_FIELDS)})])"
    data = self._check(self.conn.uid("FETCH", ",".join(map(str, uids)), spec), "read headers")
    found: list[tuple[int, frozenset[str], bytes]] = []
    for item in data:
      if isinstance(item, tuple):
        uid, flags = _meta(item[0])
        if uid is not None:
          found.append((uid, flags, item[1]))
    return found

  def fetch(self, folder: str, uid: int) -> tuple[frozenset[str], bytes] | None:
    self._select(folder)
    data = self._check(self.conn.uid("FETCH", str(uid), "(UID FLAGS BODY.PEEK[])"), "read the message")
    for item in data:
      if isinstance(item, tuple):
        _, flags = _meta(item[0])
        return flags, item[1]
    return None

  def append(self, folder: str, flags: Sequence[str], raw: bytes) -> None:
    self._check(self.conn.append(_quote(self._server_name(folder)), f"({' '.join(flags)})", None, raw), f"save to {folder}")


def _meta(head: bytes) -> tuple[int | None, frozenset[str]]:
  uid: int | None = None
  flags: frozenset[str] = frozenset()
  for match in _FETCH_META.finditer(head):
    if match.group(1):
      uid = int(match.group(1))
    else:
      flags = frozenset(match.group(2).decode().split())
  return uid, flags
