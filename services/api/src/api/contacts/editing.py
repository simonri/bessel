"""Changing, adding and deleting contacts in Google.

Each write goes to Google first, under the source's sync lock, and what Google
returns becomes Bessel's copy, so the page shows what Google stored. The
result is committed before the lock is released: a sync starting right after
must find it, or it could write back the person as they were.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

import httpx
import structlog

from api.calendars import http as provider_http
from api.calendars.google import GoogleCalendarClient
from api.calendars.locks import AccountBusyError, account_lock
from api.calendars.providers import ProviderAuthError, ProviderError, ProviderNotFoundError, ProviderRejectedError, ProviderScopeError
from api.common.encryption import decrypt
from api.common.utils import utc_now
from api.contacts.edit import build_update
from api.contacts.google import GoogleContactsClient, StaleEtag
from api.contacts.person import parse_person
from api.contacts.repository import ContactRepository, ContactSourceRepository
from api.exceptions import ForbiddenError, ResourceNotFound, ServiceUnavailableError, ValidationError
from api.logging import Logger
from api.models.calendar_account import CalendarAccount
from api.models.contact import Contact, ContactSource
from api.postgres import AsyncSession
from api.redis import Redis

log: Logger = structlog.get_logger()

LOCK_WAIT_SECONDS = 10
ALLOW_EDITING = "Allow Bessel to edit this account's contacts first."


class ContactEditor:
  @asynccontextmanager
  async def _google(self, session: AsyncSession, redis: Redis, source: ContactSource) -> AsyncIterator[tuple[GoogleContactsClient, str]]:
    account = await ContactSourceRepository.from_session(session).account_for(source)
    if not account.can_write_contacts:
      raise ForbiddenError(ALLOW_EDITING)
    try:
      async with account_lock(redis, f"contacts:{source.id}", wait_seconds=LOCK_WAIT_SECONDS):
        async with provider_http.client() as http:
          grant = await GoogleCalendarClient(http).refresh_access_token(decrypt(account.encrypted_credentials))
          yield GoogleContactsClient(http), grant.access_token
        await session.commit()
    except AccountBusyError as e:
      raise ServiceUnavailableError("Contacts are still syncing, try again in a moment") from e
    except ProviderScopeError as e:
      await self._lost_permission(session, account)
      raise ForbiddenError(ALLOW_EDITING) from e
    except ProviderAuthError as e:
      raise ForbiddenError("Google refused access to contacts. Reconnect the account.") from e
    except ProviderRejectedError as e:
      raise ValidationError(str(e), status_code=422) from e
    except (ProviderError, httpx.HTTPError) as e:
      log.warning("contact_edit_failed", source_id=str(source.id), exc_info=True)
      raise ServiceUnavailableError("Couldn't reach Google, try again") from e

  async def _lost_permission(self, session: AsyncSession, account: CalendarAccount) -> None:
    account.can_write_contacts = False
    await session.commit()

  async def update(self, session: AsyncSession, redis: Redis, user_id: UUID, contact_id: UUID, changes: dict[str, Any]) -> Contact:
    contacts = ContactRepository.from_session(session)
    contact = await contacts.get_owned_or_404(contact_id, user_id, not_found_message="Contact not found.")
    if not changes:
      return contact
    source = await ContactSourceRepository.from_session(session).get_by_id(contact.source_id)
    assert source is not None
    async with self._google(session, redis, source) as (google, token):
      person, replaced = contact.person, contact.etag
      try:
        body, fields = build_update(person, changes)
        saved = await google.update_contact(token, body, fields)
      except StaleEtag:
        # Changed in Google since the last sync: apply the same changes to the latest version, once.
        person = await google.get_person(token, contact.resource_name)
        body, fields = build_update(person, changes)
        saved = await google.update_contact(token, body, fields)
      except ProviderNotFoundError as e:
        contact.deleted_at = utc_now()
        raise ResourceNotFound("This contact was deleted in Google.") from e
      return await contacts.save_edited(source, parse_person(saved), replaced_etag=replaced)

  async def set_photo(self, session: AsyncSession, redis: Redis, user_id: UUID, contact_id: UUID, photo: bytes) -> Contact:
    contacts = ContactRepository.from_session(session)
    contact = await contacts.get_owned_or_404(contact_id, user_id, not_found_message="Contact not found.")
    source = await ContactSourceRepository.from_session(session).get_by_id(contact.source_id)
    assert source is not None
    async with self._google(session, redis, source) as (google, token):
      replaced = contact.etag
      try:
        saved = await google.update_contact_photo(token, contact.resource_name, photo)
      except ProviderNotFoundError as e:
        contact.deleted_at = utc_now()
        raise ResourceNotFound("This contact was deleted in Google.") from e
      return await contacts.save_edited(source, parse_person(saved), replaced_etag=replaced)

  async def create(self, session: AsyncSession, redis: Redis, user_id: UUID, source_id: UUID, changes: dict[str, Any]) -> Contact:
    source = await ContactSourceRepository.from_session(session).get_by_id(source_id)
    if source is None or source.user_id != user_id:
      raise ResourceNotFound("Address book not found.")
    body, _ = build_update({}, changes)
    if not any(body.get(field) for field in ("names", "organizations", "phoneNumbers", "emailAddresses")):
      raise ValidationError("Give the contact a name, company, number or email.", status_code=422)
    async with self._google(session, redis, source) as (google, token):
      saved = await google.create_contact(token, body)
      return await ContactRepository.from_session(session).save_edited(source, parse_person(saved), replaced_etag=None)

  async def delete(self, session: AsyncSession, redis: Redis, user_id: UUID, contact_id: UUID) -> None:
    contact = await ContactRepository.from_session(session).get_owned_or_404(contact_id, user_id, not_found_message="Contact not found.")
    source = await ContactSourceRepository.from_session(session).get_by_id(contact.source_id)
    assert source is not None
    async with self._google(session, redis, source) as (google, token):
      await google.delete_contact(token, contact.resource_name)
      contact.deleted_at = utc_now()


contact_editor = ContactEditor()
