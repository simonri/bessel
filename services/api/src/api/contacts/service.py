from uuid import UUID

import httpx
import structlog

from api.calendars import http as provider_http
from api.calendars.google import GoogleCalendarClient
from api.calendars.providers import ProviderAuthError, ProviderError
from api.calendars.push import SessionMaker
from api.calendars.repository import CalendarAccountRepository
from api.common.encryption import decrypt
from api.common.utils import utc_now
from api.contacts.google import GoogleContactsClient, SyncTokenExpired
from api.contacts.person import parse_person
from api.contacts.repository import ContactRepository, ContactSourceRepository
from api.logging import Logger
from api.worker import enqueue_job

log: Logger = structlog.get_logger()

SYNC_SOURCE_ACTOR = "sync_contact_source"


def request_sync(source_id: UUID) -> None:
  enqueue_job(SYNC_SOURCE_ACTOR, str(source_id))


async def sync_source(session_maker: SessionMaker, source_id: UUID) -> bool:
  """Mirrors the source's Google contacts; returns whether it synced. No
  database session is held while Google responds."""
  async with session_maker() as session:
    source = await ContactSourceRepository.from_session(session).get_by_id(source_id)
    if source is None:
      return False
    account = await CalendarAccountRepository.from_session(session).get_by_id(source.account_id)
    if account is None or account.deleted_at is not None or not account.can_read_people:
      source.sync_error = "Google no longer lets Bessel read these contacts. Reconnect the account."
      return False
    credentials, sync_token = account.encrypted_credentials, source.sync_token

  try:
    async with provider_http.client() as http:
      grant = await GoogleCalendarClient(http).refresh_access_token(decrypt(credentials))
      contacts = GoogleContactsClient(http)
      try:
        page = await contacts.list_connections(grant.access_token, sync_token)
      except SyncTokenExpired:
        page = await contacts.list_connections(grant.access_token, None)
  except ProviderAuthError:
    await _record_error(session_maker, source_id, "Google refused access to contacts. Reconnect the account.")
    return False
  except (ProviderError, httpx.HTTPError):
    log.warning("contacts_sync_failed", source_id=str(source_id), exc_info=True)
    await _record_error(session_maker, source_id, "Couldn't reach Google, retrying shortly.")
    return False

  async with session_maker() as session:
    source = await ContactSourceRepository.from_session(session).get_by_id(source_id)
    if source is None:
      return False
    changed = await ContactRepository.from_session(session).apply(source, [parse_person(p) for p in page.people], full=page.full)
    source.sync_token = page.next_sync_token
    source.synced_at = utc_now()
    source.sync_error = None
  # Counts only: contacts are other people's details.
  log.info("contacts_synced", source_id=str(source_id), full=page.full, changed=changed)
  return True


async def _record_error(session_maker: SessionMaker, source_id: UUID, message: str) -> None:
  async with session_maker() as session:
    source = await ContactSourceRepository.from_session(session).get_by_id(source_id)
    if source is not None:
      source.sync_error = message
