"""The user's iCloud Mail, through the app-specific password their iCloud calendar is connected with.

Read-only apart from saving drafts: nothing is sent, moved, marked or deleted.
"""

from collections.abc import Callable, Sequence
from contextlib import AbstractContextManager
from datetime import datetime, timedelta
from email.message import EmailMessage
from typing import TypeVar

import anyio

from api.calendars.repository import CalendarAccountRepository
from api.common.encryption import decrypt
from api.common.utils import utc_now
from api.exceptions import ResourceNotFound, ServiceUnavailableError, ValidationError
from api.mail.mailbox import Criterion, ImapMailbox, Mailbox, MailboxError, imap_date
from api.mail.messages import Envelope, Message, envelope, message, reply_draft, without_quotes
from api.mail.messages import draft as new_draft
from api.models.calendar_account import CalendarProvider
from api.models.user import User
from api.postgres import AsyncSession

INBOX = "INBOX"
MAX_THREAD_MESSAGES = 15
MAX_THREAD_IDS = 10
THREAD_ROUNDS = 3
MAX_TRIAGE_MESSAGES = 300

T = TypeVar("T")


def special_folder(box: Mailbox, role: str, fallbacks: Sequence[str]) -> str:
  """A folder by its IMAP role (\\Sent, \\Drafts), else by the names mail apps use; iCloud's Drafts has no role."""
  folders = box.folders()
  for folder in folders:
    if role in folder.flags:
      return folder.name
  by_name = {folder.name.lower(): folder.name for folder in folders}
  for name in fallbacks:
    if name.lower() in by_name:
      return by_name[name.lower()]
  raise ValidationError(f"Couldn't find the {role.lstrip(chr(92))} folder in iCloud Mail")


def sent_folder(box: Mailbox) -> str:
  return special_folder(box, "\\Sent", ["Sent Messages", "Sent", "Sent Items"])


def drafts_folder(box: Mailbox) -> str:
  return special_folder(box, "\\Drafts", ["Drafts"])


def envelopes(box: Mailbox, folder: str, uids: Sequence[int]) -> list[Envelope]:
  found = [envelope(folder, uid, flags, raw) for uid, flags, raw in box.headers(folder, uids)]
  return sorted(found, key=lambda e: e.uid, reverse=True)


def search(box: Mailbox, folder: str, criteria: Sequence[Criterion], limit: int) -> list[Envelope]:
  return envelopes(box, folder, box.search(folder, criteria)[:limit])


def read(box: Mailbox, folder: str, uid: int) -> Message:
  fetched = box.fetch(folder, uid)
  if fetched is None:
    raise ResourceNotFound(f"No message {uid} in {folder}")
  return message(folder, uid, *fetched)


def _thread_ids(head: Envelope) -> list[str]:
  return list(dict.fromkeys([*head.references, *filter(None, [head.in_reply_to, head.message_id])]))


def thread(box: Mailbox, folder: str, uid: int) -> list[Message]:
  """The conversation a message belongs to, in the inbox and in sent mail, oldest first, each without the quotes
  of the ones before it."""
  start = read(box, folder, uid)
  found: dict[str, Message] = {start.envelope.message_id or f"{folder}:{uid}": start}
  folders = list(dict.fromkeys([folder, INBOX, sent_folder(box)]))
  searched: set[str] = set()
  # Each message names only some of the ones before it, so follow the ids it reveals, a few rounds deep.
  for _ in range(THREAD_ROUNDS):
    ids = [i for m in found.values() for i in _thread_ids(m.envelope) if i not in searched][-MAX_THREAD_IDS:]
    if not ids:
      break
    searched |= set(ids)
    for where in folders:
      uids: set[int] = set()
      for message_id in ids:
        uids |= set(box.search(where, [Criterion("HEADER", f"Message-ID {message_id}")]))
        uids |= set(box.search(where, [Criterion("HEADER", f"References {message_id}")]))
      for other in envelopes(box, where, sorted(uids)):
        key = other.message_id or f"{where}:{other.uid}"
        if key not in found and len(found) < MAX_THREAD_MESSAGES:
          found[key] = read(box, where, other.uid)
  ordered = sorted(found.values(), key=lambda m: m.envelope.date.timestamp() if m.envelope.date else 0.0)
  return [Message(m.envelope, without_quotes(m.text), m.truncated, m.attachments) for m in ordered]


def owed_replies(box: Mailbox, own_address: str, since: datetime, limit: int) -> list[Envelope]:
  """People whose latest mail you haven't answered: no reply in its thread and nothing sent to them since, newest
  first. Mailing lists, notifications and your own mail don't count."""
  sent_in = sent_folder(box)
  criteria = [Criterion("SINCE", imap_date(since.date()))]
  sent = envelopes(box, sent_in, box.search(sent_in, criteria)[:MAX_TRIAGE_MESSAGES])
  own = {own_address.lower()} | {e.sender.address for e in sent if e.sender}
  answered = {e.in_reply_to for e in sent if e.in_reply_to} | {ref for e in sent for ref in e.references}
  last_sent_to: dict[str, datetime] = {}
  for e in sent:
    for recipient in [*e.to, *e.cc] if e.date else []:
      previous = last_sent_to.get(recipient.address)
      if previous is None or e.date > previous:
        last_sent_to[recipient.address] = e.date

  latest: dict[str, Envelope] = {}
  for e in envelopes(box, INBOX, box.search(INBOX, criteria)[:MAX_TRIAGE_MESSAGES]):
    if e.automated or e.sender is None or e.sender.address in own or e.date is None or e.date < since:
      continue
    if e.message_id in answered:
      continue
    replied_after = last_sent_to.get(e.sender.address)
    if replied_after is not None and replied_after >= e.date:
      continue
    if e.sender.address not in latest or e.date > (latest[e.sender.address].date or e.date):
      latest[e.sender.address] = e
  return sorted(latest.values(), key=lambda e: e.date or since, reverse=True)[:limit]


def save_draft(box: Mailbox, mail: EmailMessage) -> str:
  folder = drafts_folder(box)
  box.append(folder, ["\\Draft", "\\Seen"], mail.as_bytes())
  return folder


def new_email_draft(box: Mailbox, own_address: str, to: Sequence[str], subject: str, body: str, cc: Sequence[str], now: datetime) -> str:
  return save_draft(box, new_draft(own_address, to, subject, body, cc=cc, now=now))


def reply_email_draft(box: Mailbox, own_address: str, folder: str, uid: int, body: str, reply_all: bool, now: datetime) -> tuple[str, str]:
  original = read(box, folder, uid)
  mail = reply_draft(own_address, frozenset({own_address.lower()}), original, body, reply_all=reply_all, now=now)
  return save_draft(box, mail), str(mail["Subject"])


class MailService:
  def __init__(self, open_mailbox: Callable[[str, str], AbstractContextManager[Mailbox]] = ImapMailbox) -> None:
    self.open_mailbox = open_mailbox

  async def _credentials(self, session: AsyncSession, user: User) -> tuple[str, str]:
    accounts = await CalendarAccountRepository.from_session(session).list_for_user(user.id)
    account = next((a for a in accounts if a.provider == CalendarProvider.icloud), None)
    if account is None:
      raise ResourceNotFound("iCloud isn't connected: connect it in Bessel (Settings > Calendars) with an app-specific password")
    return account.email, decrypt(account.encrypted_credentials)

  async def run(self, session: AsyncSession, user: User, operation: Callable[[Mailbox, str], T]) -> T:
    """Runs `operation` against the user's mailbox, signed in for just this call."""
    username, password = await self._credentials(session, user)

    def work() -> T:
      with self.open_mailbox(username, password) as box:
        return operation(box, username)

    try:
      return await anyio.to_thread.run_sync(work)
    except MailboxError as error:
      raise ServiceUnavailableError(str(error)) from error


def recent(days: int) -> datetime:
  return utc_now() - timedelta(days=days)


mail_service = MailService()
