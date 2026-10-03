"""Creating, changing and deleting events in the connected provider.

Every write goes to Google/iCloud first; Bessel's copy is then refreshed from
the provider (under the account's sync lock) so what the UI shows is what the
provider stored, including server-side effects like new Meet links.
"""

from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import date, datetime
from typing import Protocol
from uuid import UUID

import httpx
import structlog

from api.calendars import http as provider_http
from api.calendars.edits import EditScope, EventChanges, Reply, TargetEvent, UnsupportedEditError
from api.calendars.google import GoogleCalendarClient
from api.calendars.google_edits import GoogleEventEditor
from api.calendars.icloud import ICloudCalendarClient
from api.calendars.icloud_edits import ICloudEventEditor
from api.calendars.locks import AccountBusyError, account_lock
from api.calendars.providers import (
  ProviderAuthError,
  ProviderConflictError,
  ProviderError,
  ProviderEvent,
  ProviderForbiddenError,
  ProviderNotFoundError,
  ProviderRejectedError,
  ProviderScopeError,
  ProviderUnavailableError,
)
from api.calendars.repository import CalendarEventRepository, CalendarRepository
from api.calendars.schemas import EventCreate, EventReplyUpdate, EventUpdate
from api.calendars.service import calendar_service, require_google_config, sync_window
from api.common.encryption import decrypt
from api.exceptions import ConflictError, ForbiddenError, ResourceNotFound, ServiceUnavailableError, ValidationError
from api.logging import Logger
from api.models.calendar import Calendar
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.calendar_event import CalendarEvent
from api.postgres import AsyncSession
from api.redis import Redis

log: Logger = structlog.get_logger()

# How long an edit waits for a running sync of the same account.
LOCK_WAIT_SECONDS = 15
_PROVIDER_NAMES = {CalendarProvider.google: "Google Calendar", CalendarProvider.icloud: "iCloud"}


class EventEditor(Protocol):
  async def create(self, calendar_id: str, changes: EventChanges) -> str: ...

  async def update(self, target: TargetEvent, changes: EventChanges, scope: EditScope, destination: str | None = None) -> str: ...

  async def delete(self, target: TargetEvent, scope: EditScope) -> None: ...

  async def respond(self, target: TargetEvent, reply: Reply, scope: EditScope) -> str: ...


@dataclass(frozen=True, slots=True)
class _Provider:
  editor: EventEditor
  list_events: Callable[[str], Awaitable[list[ProviderEvent]]]


@asynccontextmanager
async def _connect(account: CalendarAccount, *, time_zone: str, send_updates: bool) -> AsyncIterator[_Provider]:
  secret = decrypt(account.encrypted_credentials)
  start, end = sync_window()
  async with provider_http.client() as http:
    if account.provider == CalendarProvider.google:
      require_google_config()
      google = GoogleCalendarClient(http)
      grant = await google.refresh_access_token(secret)
      if not grant.can_write:
        raise ProviderScopeError("Bessel isn't allowed to change events in this Google account")
      token = grant.access_token

      async def list_google(calendar_id: str) -> list[ProviderEvent]:
        return await google.list_events(token, calendar_id, start, end)

      yield _Provider(GoogleEventEditor(google, token, send_updates=send_updates, time_zone=time_zone), list_google)
    else:
      icloud = ICloudCalendarClient(http, account.email, secret)

      async def list_icloud(calendar_url: str) -> list[ProviderEvent]:
        return await icloud.list_events(calendar_url, start, end)

      yield _Provider(ICloudEventEditor(icloud, time_zone=time_zone), list_icloud)


def _target(event: CalendarEvent, calendar: Calendar) -> TargetEvent:
  start: datetime | date | None = event.start_at if not event.all_day else event.start_date
  end: datetime | date | None = event.end_at if not event.all_day else event.end_date
  assert start is not None and end is not None
  return TargetEvent(
    calendar_external_id=calendar.external_id,
    external_id=event.external_id,
    start=start,
    end=end,
    series_id=event.series_id,
    original_start=event.original_start,
    rule=event.rrule,
    etag=event.etag,
    resource_href=event.resource_href,
    attendee_emails=tuple(a["email"] for a in event.attendees),
  )


def _ensure_writable(account: CalendarAccount, calendar: Calendar) -> None:
  if not account.can_write:
    raise ForbiddenError(f"Reconnect {account.email} to allow Bessel to change its events")
  if not calendar.writable:
    raise ForbiddenError(f"“{calendar.name}” is read-only")


class CalendarEditService:
  async def create_event(self, session: AsyncSession, redis: Redis, user_id: UUID, calendar_id: UUID, body: EventCreate) -> CalendarEvent | None:
    calendar, account = await CalendarRepository.from_session(session).get_owned_with_account(calendar_id, user_id)
    _ensure_writable(account, calendar)
    changes = body.to_changes(all_day=body.timing.to_timing().all_day)
    async with self._writing(session, redis, account, [calendar], time_zone=body.time_zone, send_updates=body.notify_guests) as provider:
      provider_id = await provider.editor.create(calendar.external_id, changes)
    near = changes.timing.start if changes.timing else None
    return await CalendarEventRepository.from_session(session).find_written(calendar.id, provider_id, near)

  async def update_event(self, session: AsyncSession, redis: Redis, user_id: UUID, event_id: UUID, body: EventUpdate) -> CalendarEvent | None:
    events = CalendarEventRepository.from_session(session)
    event, calendar, account = await events.get_owned_with_context(event_id, user_id)
    _ensure_writable(account, calendar)
    changes = body.to_changes(all_day=event.all_day)
    if not event.editable and not changes.only_color:
      raise ForbiddenError("Only the organizer can change this event")
    destination = calendar
    if body.calendar_id is not None and body.calendar_id != calendar.id:
      destination, destination_account = await CalendarRepository.from_session(session).get_owned_with_account(body.calendar_id, user_id)
      if destination_account.id != account.id:
        raise ValidationError("Events can only move between calendars of the same account", status_code=422)
      _ensure_writable(account, destination)

    target = _target(event, calendar)
    near = changes.timing.start if changes.timing else target.start
    affected = [calendar] if destination is calendar else [calendar, destination]
    async with self._writing(session, redis, account, affected, time_zone=body.time_zone, send_updates=body.notify_guests) as provider:
      provider_id = await provider.editor.update(target, changes, body.scope, destination.external_id if destination is not calendar else None)
    return await events.find_written(destination.id, provider_id, near)

  async def delete_event(
    self,
    session: AsyncSession,
    redis: Redis,
    user_id: UUID,
    event_id: UUID,
    scope: EditScope,
    *,
    time_zone: str,
    notify_guests: bool,
  ) -> None:
    event, calendar, account = await CalendarEventRepository.from_session(session).get_owned_with_context(event_id, user_id)
    _ensure_writable(account, calendar)
    if not event.editable:
      raise ForbiddenError("Only the organizer can delete this event")
    async with self._writing(session, redis, account, [calendar], time_zone=time_zone, send_updates=notify_guests) as provider:
      await provider.editor.delete(_target(event, calendar), scope)

  async def respond_to_event(self, session: AsyncSession, redis: Redis, user_id: UUID, event_id: UUID, body: EventReplyUpdate) -> CalendarEvent | None:
    """Answers an invitation. Allowed on events the account can't edit: a guest
    may always change their own reply."""
    events = CalendarEventRepository.from_session(session)
    event, calendar, account = await events.get_owned_with_context(event_id, user_id)
    if event.my_response is None:
      raise ValidationError("You're not a guest of this event", status_code=422)
    _ensure_writable(account, calendar)
    target = _target(event, calendar)
    # Replies carry no times; the zone only matters for editing.
    async with self._writing(session, redis, account, [calendar], time_zone="UTC", send_updates=body.notify_organizer) as provider:
      provider_id = await provider.editor.respond(target, body.response, body.scope)
    return await events.find_written(calendar.id, provider_id, target.start)

  @asynccontextmanager
  async def _writing(
    self,
    session: AsyncSession,
    redis: Redis,
    account: CalendarAccount,
    calendars: list[Calendar],
    *,
    time_zone: str,
    send_updates: bool,
  ) -> AsyncIterator[_Provider]:
    """Holds the account lock around a provider write and the refresh after it,
    and turns provider failures into API errors."""
    provider_name = _PROVIDER_NAMES[account.provider]
    try:
      async with account_lock(redis, account.id, wait_seconds=LOCK_WAIT_SECONDS):
        async with _connect(account, time_zone=time_zone, send_updates=send_updates) as provider:
          yield provider
          events = CalendarEventRepository.from_session(session)
          for calendar in calendars:
            await events.replace_for_calendar(calendar, await provider.list_events(calendar.external_id))
    except AccountBusyError as e:
      raise ServiceUnavailableError(f"{provider_name} is still syncing, try again in a moment") from e
    except UnsupportedEditError as e:
      raise ValidationError(str(e), status_code=422) from e
    except ProviderScopeError as e:
      # A sync re-reads the granted scopes and marks the account read-only.
      calendar_service.request_sync(account.id)
      raise ForbiddenError(f"Reconnect {account.email} to allow Bessel to change its events") from e
    except ProviderAuthError as e:
      calendar_service.request_sync(account.id)
      raise ForbiddenError(f"{provider_name} rejected the saved sign-in for {account.email}. Reconnect the account.") from e
    except ProviderConflictError as e:
      calendar_service.request_sync(account.id)
      raise ConflictError(f"This event changed in {provider_name} since it was loaded. It's being refreshed, try again.") from e
    except ProviderNotFoundError as e:
      calendar_service.request_sync(account.id)
      raise ResourceNotFound(f"This event no longer exists in {provider_name}") from e
    except ProviderForbiddenError as e:
      raise ForbiddenError(str(e)) from e
    except ProviderRejectedError as e:
      raise ValidationError(str(e), status_code=422) from e
    except (ProviderUnavailableError, httpx.HTTPError) as e:
      log.warning("calendar_write_unavailable", account_id=str(account.id), error=str(e))
      raise ServiceUnavailableError(f"Couldn't reach {provider_name}, try again in a moment") from e
    except ProviderError as e:
      log.exception("calendar_write_failed", account_id=str(account.id))
      raise ServiceUnavailableError(str(e) or f"{provider_name} couldn't save the change") from e


calendar_edit_service = CalendarEditService()
