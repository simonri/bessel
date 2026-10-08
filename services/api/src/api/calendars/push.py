"""Getting provider changes into Bessel within seconds instead of on the next cron sync.

- Google pushes: every calendar has a watch channel, Google POSTs to our webhook
  when anything in it changes, and we re-sync that one calendar.
- iCloud can't push to third parties, so a cheap check every minute compares
  each calendar's ctag with the one from the last sync.
- Open pages learn about finished syncs over Redis pub/sub (`change_events`).
"""

import hmac
import secrets
import time
from collections.abc import AsyncIterator, Callable, Mapping, Sequence
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID, uuid4

import anyio
import httpx
import structlog

from api.calendars import http as provider_http
from api.calendars.google import GoogleCalendarClient
from api.calendars.providers import ProviderAuthError, ProviderError
from api.calendars.repository import CalendarAccountRepository, CalendarRepository
from api.common.encryption import decrypt
from api.common.utils import utc_now
from api.logging import Logger
from api.models.calendar import Calendar
from api.models.calendar_account import CalendarProvider
from api.postgres import AsyncSession
from api.redis import Redis
from api.settings import settings
from api.worker import enqueue_job

log: Logger = structlog.get_logger()

PUSH_SYNC_ACTOR = "sync_calendar_from_push"
# Renew this long before Google expires a channel, so a failed renewal has
# several cron runs to succeed before notifications stop.
CHANNEL_RENEW_BEFORE = timedelta(days=1)
# Calendars Google won't watch (e.g. birthdays) are retried this rarely.
WATCH_RETRY_AFTER = timedelta(hours=6)
# Google often sends several notifications for one change; wait for the burst.
PUSH_SYNC_DELAY_MS = 1_500
BUSY_RETRY_DELAY_MS = 3_000
MAX_BUSY_RETRIES = 20
PENDING_TTL_SECONDS = 300
HEARTBEAT_SECONDS = 20
# Each open change stream holds a Redis connection, so a user gets a few. They
# end after an hour, and the client reconnects with a freshly checked sign-in.
MAX_STREAMS_PER_USER = 5
STREAM_LIFETIME_SECONDS = 3600
STREAM_SLOT_GRACE_SECONDS = 60

type SessionMaker = Callable[[], AbstractAsyncContextManager[AsyncSession]]


def webhook_url() -> str | None:
  """Where Google should deliver notifications, or None when it can't reach us.

  Google only delivers to public HTTPS addresses, so local development relies
  on the cron sync instead.
  """
  if not settings.API_BASE_URL.startswith("https://"):
    return None
  return f"{settings.API_BASE_URL.rstrip('/')}/v1/calendars/google/webhook"


def changes_channel(user_id: UUID) -> str:
  return f"calendars:changes:{user_id}"


async def publish_change(redis: Redis, user_id: UUID) -> None:
  """Tells the user's open pages to refetch. Call only after the sync committed."""
  await redis.publish(changes_channel(user_id), "sync")


class TooManyStreamsError(Exception):
  """The user already has `MAX_STREAMS_PER_USER` change streams open."""


def _streams_key(user_id: UUID) -> str:
  return f"calendars:streams:{user_id}"


async def claim_stream_slot(redis: Redis, user_id: UUID) -> str:
  """Reserves one of the user's change streams; each holds a Redis connection.

  Slots are released when their stream ends. One whose stream never started or
  whose process died lapses once the stream would have ended anyway.
  """
  key, slot, now = _streams_key(user_id), uuid4().hex, time.time()
  async with redis.pipeline(transaction=True) as pipe:
    pipe.zremrangebyscore(key, "-inf", now - STREAM_LIFETIME_SECONDS - STREAM_SLOT_GRACE_SECONDS)
    pipe.zadd(key, {slot: now})
    pipe.zcard(key)
    pipe.expire(key, STREAM_LIFETIME_SECONDS + STREAM_SLOT_GRACE_SECONDS)
    _, _, open_streams, _ = await pipe.execute()
  if open_streams > MAX_STREAMS_PER_USER:
    await redis.zrem(key, slot)
    raise TooManyStreamsError(str(user_id))
  return slot


async def change_events(
  redis: Redis,
  user_id: UUID,
  *,
  slot: str | None = None,
  heartbeat_seconds: float = HEARTBEAT_SECONDS,
  lifetime_seconds: float = STREAM_LIFETIME_SECONDS,
) -> AsyncIterator[str]:
  """Server-sent events for one user: `changed` after each sync, and a comment
  every `heartbeat_seconds` so proxies don't close an idle stream.

  Ends after `lifetime_seconds` so clients reconnect, which re-checks their
  sign-in, and releases `slot` (from `claim_stream_slot`) when done.
  """
  deadline = time.monotonic() + lifetime_seconds
  pubsub = redis.pubsub()
  try:
    await pubsub.subscribe(changes_channel(user_id))
    yield ": connected\n\n"
    while (remaining := deadline - time.monotonic()) > 0:
      message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=min(heartbeat_seconds, remaining))
      if message:
        yield "event: changed\ndata: {}\n\n"
      elif time.monotonic() < deadline:
        yield ": ping\n\n"
  finally:
    # Shielded: a client disconnect cancels the stream, and cleanup must survive it.
    with anyio.CancelScope(shield=True):
      await pubsub.aclose()
      if slot is not None:
        await redis.zrem(_streams_key(user_id), slot)


def _pending_key(calendar_id: UUID | str) -> str:
  return f"calendars:push-pending:{calendar_id}"


async def request_push_sync(redis: Redis, calendar_id: UUID) -> bool:
  """Schedules a sync of one calendar unless one is already waiting to start,
  so a burst of notifications becomes a single sync."""
  if not await redis.set(_pending_key(calendar_id), "1", nx=True, ex=PENDING_TTL_SECONDS):
    return False
  enqueue_job(PUSH_SYNC_ACTOR, str(calendar_id), delay=PUSH_SYNC_DELAY_MS)
  return True


async def clear_pending_push_sync(redis: Redis, calendar_id: UUID | str) -> None:
  await redis.delete(_pending_key(calendar_id))


@dataclass(frozen=True, slots=True)
class GoogleNotification:
  channel_id: str | None
  token: str | None
  resource_id: str | None
  resource_state: str | None

  @classmethod
  def from_headers(cls, headers: Mapping[str, str]) -> "GoogleNotification":
    return cls(
      channel_id=headers.get("x-goog-channel-id"),
      token=headers.get("x-goog-channel-token"),
      resource_id=headers.get("x-goog-resource-id"),
      resource_state=headers.get("x-goog-resource-state"),
    )


async def handle_google_notification(calendars: CalendarRepository, redis: Redis, notification: GoogleNotification) -> bool:
  """Schedules a sync for a genuine change notification; returns whether it did.

  Anything else (Google's `sync` handshake, a channel we replaced or forgot, a
  forged request) is ignored. The webhook answers 200 either way, so callers
  learn nothing and Google stops retrying.
  """
  if notification.resource_state == "sync" or not notification.channel_id:
    return False
  calendar = await calendars.get_by_push_channel(notification.channel_id)
  if (
    calendar is None
    or calendar.push_token is None
    or not hmac.compare_digest(calendar.push_token, notification.token or "")
    or calendar.push_resource_id != notification.resource_id
  ):
    log.info("calendar_push_ignored", channel_id=notification.channel_id)
    return False
  return await request_push_sync(redis, calendar.id)


@dataclass(frozen=True, slots=True)
class _Watch:
  calendar_id: UUID
  external_id: str
  old_channel: tuple[str, str] | None


@dataclass(frozen=True, slots=True)
class _Opened:
  channel_id: str
  token: str
  resource_id: str
  expires_at: datetime


def _renew_at(expires_at: datetime) -> datetime:
  now = utc_now()
  # Halfway to expiry when Google grants less than the usual margin.
  return max(expires_at - CHANNEL_RENEW_BEFORE, now + (expires_at - now) / 2)


def _is_due(calendar: Calendar, now: datetime) -> bool:
  return calendar.push_renew_at is None or calendar.push_renew_at <= now


async def renew_google_channels(session_maker: SessionMaker, account_id: UUID) -> None:
  """Opens a channel for every calendar of the account that has none or whose
  channel expires soon. No database session is held while Google responds."""
  address = webhook_url()
  if address is None:
    return
  async with session_maker() as session:
    account = await CalendarAccountRepository.from_session(session).get_by_id(account_id)
    if account is None or account.provider != CalendarProvider.google:
      return
    now = utc_now()
    due = [
      _Watch(c.id, c.external_id, (c.push_channel_id, c.push_resource_id) if c.push_channel_id and c.push_resource_id else None)
      for c in await CalendarRepository.from_session(session).list_for_account(account)
      if _is_due(c, now)
    ]
    credentials = account.encrypted_credentials
  if not due:
    return

  opened: dict[UUID, _Opened | None] = {}
  async with provider_http.client() as http:
    google = GoogleCalendarClient(http)
    access_token = (await google.refresh_access_token(decrypt(credentials))).access_token
    for watch in due:
      channel_id, token = uuid4().hex, secrets.token_urlsafe(32)
      try:
        channel = await google.watch_events(access_token, watch.external_id, channel_id=channel_id, address=address, token=token)
      except ProviderAuthError:
        raise
      except (ProviderError, httpx.HTTPError) as e:
        # Includes calendars Google can't watch and an unverified webhook domain.
        log.warning("calendar_watch_failed", calendar_id=str(watch.calendar_id), error=str(e))
        opened[watch.calendar_id] = None
        continue
      opened[watch.calendar_id] = _Opened(channel_id, token, channel.resource_id, channel.expires_at)

  replaced: list[tuple[str, str]] = []
  async with session_maker() as session:
    repository = CalendarRepository.from_session(session)
    for watch in due:
      calendar = await repository.get_by_id(watch.calendar_id)
      if calendar is None:
        continue
      result = opened[watch.calendar_id]
      if result is None:
        # The old channel (if any) keeps working until it expires.
        calendar.push_renew_at = utc_now() + WATCH_RETRY_AFTER
        continue
      calendar.push_channel_id = result.channel_id
      calendar.push_token = result.token
      calendar.push_resource_id = result.resource_id
      calendar.push_renew_at = _renew_at(result.expires_at)
      if watch.old_channel is not None:
        replaced.append(watch.old_channel)

  # Only after the new channels are saved, so no change falls in between.
  if replaced:
    async with provider_http.client() as http:
      await _stop_channels(GoogleCalendarClient(http), access_token, replaced)


async def stop_google_channels(google: GoogleCalendarClient, refresh_token: str, calendars: Sequence[Calendar]) -> None:
  """Best effort: Google expires channels on its own anyway."""
  channels = [(c.push_channel_id, c.push_resource_id) for c in calendars if c.push_channel_id and c.push_resource_id]
  if not channels:
    return
  try:
    access_token = (await google.refresh_access_token(refresh_token)).access_token
  except (ProviderError, httpx.HTTPError):
    log.warning("calendar_channel_stop_skipped")
    return
  await _stop_channels(google, access_token, channels)


async def _stop_channels(google: GoogleCalendarClient, access_token: str, channels: Sequence[tuple[str, str]]) -> None:
  for channel_id, resource_id in channels:
    try:
      await google.stop_channel(access_token, channel_id, resource_id)
    except (ProviderError, httpx.HTTPError) as e:
      log.warning("calendar_channel_stop_failed", channel_id=channel_id, error=str(e))
