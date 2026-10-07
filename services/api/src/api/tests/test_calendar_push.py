import asyncio
import time
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import anyio
import httpx
import pytest
import pytest_asyncio
from api.app import app as api_app
from api.calendars import http as provider_http
from api.calendars import push, tasks
from api.calendars.google import GoogleCalendarClient
from api.calendars.locks import account_lock
from api.calendars.providers import ProviderAuthError, ProviderCalendar
from api.calendars.repository import CalendarRepository
from api.calendars.service import calendar_service
from api.common.encryption import encrypt
from api.common.utils import utc_now
from api.models.calendar import Calendar
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.calendar_event import CalendarEvent
from api.models.user import User
from api.postgres import AsyncSession
from api.redis import Redis, create_redis, get_redis
from api.settings import settings
from api.tests.calendar_fakes import FakeGoogleCalendar, google_error
from api.tests.fixtures.base import TEST_USER_INFO
from api.tests.fixtures.database import SaveFixture
from api.worker._enqueue import JobQueueManager
from cryptography.fernet import Fernet
from httpx import AsyncClient
from pytest_mock import MockerFixture
from sqlalchemy import select

WEBHOOK = "https://api.example.com/v1/calendars/google/webhook"


@pytest.fixture(autouse=True)
def configured(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())
  monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "id")
  monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "secret")
  monkeypatch.setattr(settings, "API_BASE_URL", "https://api.example.com")


@pytest_asyncio.fixture
async def redis() -> AsyncIterator[Redis]:
  client = create_redis("script")
  api_app.dependency_overrides[get_redis] = lambda: client
  yield client
  api_app.dependency_overrides.pop(get_redis)
  await client.aclose()


@pytest.fixture
def google(monkeypatch: pytest.MonkeyPatch) -> FakeGoogleCalendar:
  fake = FakeGoogleCalendar()
  transport = fake.transport()
  monkeypatch.setattr(provider_http, "client", lambda: httpx.AsyncClient(transport=transport))
  return fake


@pytest.fixture
def commits() -> list[str]:
  """Order of worker session commits and published change notifications."""
  return []


@pytest.fixture
def worker(monkeypatch: pytest.MonkeyPatch, session: AsyncSession, redis: Redis, commits: list[str]) -> Iterator[None]:
  """Runs tasks against the test session and Redis, as the worker would."""

  @asynccontextmanager
  async def session_maker() -> AsyncIterator[AsyncSession]:
    yield session
    await session.flush()
    commits.append("commit")

  real_publish = push.publish_change

  async def publish(redis: Redis, user_id: UUID) -> None:
    commits.append("publish")
    await real_publish(redis, user_id)

  monkeypatch.setattr(tasks, "AsyncSessionMaker", session_maker)
  monkeypatch.setattr(tasks.RedisMiddleware, "get", lambda: redis)
  monkeypatch.setattr(push, "publish_change", publish)
  yield


async def _user(save_fixture: SaveFixture) -> User:
  user = User(auth0_sub=f"auth0|{uuid4()}", email="me@example.com")
  await save_fixture(user)
  return user


async def _google_account(save_fixture: SaveFixture, user: User, *calendars: Calendar) -> CalendarAccount:
  account = CalendarAccount(user_id=user.id, provider=CalendarProvider.google, email="me@gmail.com", encrypted_credentials=encrypt("refresh"), can_write=True)
  await save_fixture(account)
  for calendar in calendars:
    calendar.account_id = account.id
    await save_fixture(calendar)
  return account


def _calendar(external_id: str, **fields: object) -> Calendar:
  return Calendar(external_id=external_id, name=external_id, color="#4986e7", writable=True, **fields)


def _enqueued(manager: JobQueueManager) -> list[tuple[str, tuple[object, ...], int | None]]:
  return [(actor, args, delay) for actor, args, _, delay in manager._enqueued_jobs]


async def _drain_pending(redis: Redis, *calendar_ids: UUID) -> None:
  for calendar_id in calendar_ids:
    await push.clear_pending_push_sync(redis, calendar_id)


class TestWebhookUrl:
  def test_only_public_https(self, monkeypatch: pytest.MonkeyPatch) -> None:
    assert push.webhook_url() == WEBHOOK
    monkeypatch.setattr(settings, "API_BASE_URL", "http://localhost:8100")
    assert push.webhook_url() is None


class TestRenewChannels:
  @pytest.mark.asyncio
  async def test_opens_channels_for_calendars_without_one(
    self, session: AsyncSession, save_fixture: SaveFixture, google: FakeGoogleCalendar, worker: None
  ) -> None:
    work, home = _calendar("work@group"), _calendar("home@group")
    account = await _google_account(save_fixture, await _user(save_fixture), work, home)

    await push.renew_google_channels(tasks.AsyncSessionMaker, account.id)

    assert {c[0] for c in google.channels.values()} == {"work@group", "home@group"}
    for calendar in (work, home):
      calendar_id, address, token, resource_id = google.channels[calendar.push_channel_id or ""]
      assert (calendar_id, address) == (calendar.external_id, WEBHOOK)
      assert calendar.push_token == token and len(token) >= 32
      assert calendar.push_resource_id == resource_id
      expires = datetime.fromtimestamp(google.now_ms / 1000, UTC) + timedelta(days=7)
      assert calendar.push_renew_at == expires - push.CHANNEL_RENEW_BEFORE
    assert work.push_token != home.push_token

  @pytest.mark.asyncio
  async def test_renews_only_due_channels_and_stops_the_old_one_after_saving(
    self, session: AsyncSession, save_fixture: SaveFixture, google: FakeGoogleCalendar, worker: None
  ) -> None:
    fresh = _calendar("fresh", push_channel_id="ch-fresh", push_resource_id="r1", push_token="t1", push_renew_at=utc_now() + timedelta(days=3))
    due = _calendar("due", push_channel_id="ch-old", push_resource_id="r-old", push_token="t2", push_renew_at=utc_now() - timedelta(minutes=1))
    account = await _google_account(save_fixture, await _user(save_fixture), fresh, due)

    await push.renew_google_channels(tasks.AsyncSessionMaker, account.id)

    assert fresh.push_channel_id == "ch-fresh"
    assert due.push_channel_id not in (None, "ch-old")
    assert google.stopped == [("ch-old", "r-old")]
    assert list(google.channels) == [due.push_channel_id]

  @pytest.mark.asyncio
  async def test_unwatchable_calendar_backs_off_and_keeps_its_old_channel(
    self, session: AsyncSession, save_fixture: SaveFixture, google: FakeGoogleCalendar, worker: None
  ) -> None:
    google.watch_failures["birthdays"] = google_error(400, "pushNotSupportedForRequestedResource")
    birthdays = _calendar("birthdays", push_channel_id="ch", push_resource_id="r", push_token="t", push_renew_at=utc_now())
    account = await _google_account(save_fixture, await _user(save_fixture), birthdays)

    await push.renew_google_channels(tasks.AsyncSessionMaker, account.id)

    assert (birthdays.push_channel_id, birthdays.push_token) == ("ch", "t")
    assert birthdays.push_renew_at is not None
    assert birthdays.push_renew_at > utc_now() + push.WATCH_RETRY_AFTER - timedelta(minutes=1)
    assert google.stopped == []

  @pytest.mark.asyncio
  async def test_short_lived_channel_renews_halfway(self, session: AsyncSession, save_fixture: SaveFixture, google: FakeGoogleCalendar, worker: None) -> None:
    google.channel_lifetime_ms = 3_600_000
    calendar = _calendar("short")
    account = await _google_account(save_fixture, await _user(save_fixture), calendar)

    await push.renew_google_channels(tasks.AsyncSessionMaker, account.id)

    assert calendar.push_renew_at is not None
    assert utc_now() + timedelta(minutes=25) < calendar.push_renew_at < utc_now() + timedelta(minutes=35)

  @pytest.mark.asyncio
  async def test_nothing_without_a_public_webhook(
    self, monkeypatch: pytest.MonkeyPatch, session: AsyncSession, save_fixture: SaveFixture, google: FakeGoogleCalendar, worker: None
  ) -> None:
    monkeypatch.setattr(settings, "API_BASE_URL", "http://localhost:8100")
    calendar = _calendar("work")
    account = await _google_account(save_fixture, await _user(save_fixture), calendar)

    await push.renew_google_channels(tasks.AsyncSessionMaker, account.id)

    assert google.requests == [] and google.channels == {}
    assert calendar.push_channel_id is None


class TestWebhook:
  async def _watched(self, save_fixture: SaveFixture) -> Calendar:
    calendar = _calendar("work", push_channel_id="channel-1", push_resource_id="resource-1", push_token="s3cret", push_renew_at=utc_now() + timedelta(days=2))
    await _google_account(save_fixture, await _user(save_fixture), calendar)
    return calendar

  @staticmethod
  def _headers(**overrides: str) -> dict[str, str]:
    headers = {
      "X-Goog-Channel-ID": "channel-1",
      "X-Goog-Channel-Token": "s3cret",
      "X-Goog-Resource-ID": "resource-1",
      "X-Goog-Resource-State": "exists",
      "X-Goog-Message-Number": "2",
    }
    return {**headers, **overrides}

  @pytest.mark.asyncio
  async def test_change_schedules_one_sync_for_a_burst(
    self, client: AsyncClient, save_fixture: SaveFixture, redis: Redis, job_queue_manager: JobQueueManager
  ) -> None:
    calendar = await self._watched(save_fixture)
    try:
      for _ in range(3):
        assert (await client.post("/v1/calendars/google/webhook", headers=self._headers())).status_code == 200
      assert _enqueued(job_queue_manager) == [(push.PUSH_SYNC_ACTOR, (str(calendar.id),), push.PUSH_SYNC_DELAY_MS)]
    finally:
      await _drain_pending(redis, calendar.id)

  @pytest.mark.parametrize(
    "overrides",
    [
      {"X-Goog-Resource-State": "sync"},
      {"X-Goog-Channel-Token": "wrong"},
      {"X-Goog-Resource-ID": "someone-elses"},
      {"X-Goog-Channel-ID": "unknown"},
    ],
    ids=["handshake", "bad-token", "other-resource", "unknown-channel"],
  )
  @pytest.mark.asyncio
  async def test_ignores_anything_but_a_genuine_change(
    self, client: AsyncClient, save_fixture: SaveFixture, redis: Redis, job_queue_manager: JobQueueManager, overrides: dict[str, str]
  ) -> None:
    await self._watched(save_fixture)
    resp = await client.post("/v1/calendars/google/webhook", headers=self._headers(**overrides))
    assert resp.status_code == 200
    assert job_queue_manager._enqueued_jobs == []

  @pytest.mark.asyncio
  async def test_without_headers(self, client: AsyncClient, redis: Redis, job_queue_manager: JobQueueManager) -> None:
    assert (await client.post("/v1/calendars/google/webhook")).status_code == 200
    assert job_queue_manager._enqueued_jobs == []


class TestPushSync:
  @pytest.mark.asyncio
  async def test_resyncs_the_calendar_then_tells_pages(
    self, session: AsyncSession, save_fixture: SaveFixture, google: FakeGoogleCalendar, redis: Redis, worker: None, commits: list[str]
  ) -> None:
    calendar = _calendar("work")
    account = await _google_account(save_fixture, await _user(save_fixture), calendar)
    google.add("work", {"id": "e1", "summary": "Added in Notion", "start": {"dateTime": utc_now().isoformat()}, "end": {"dateTime": utc_now().isoformat()}})
    pubsub = redis.pubsub()
    await pubsub.subscribe(push.changes_channel(account.user_id))

    await tasks.sync_calendar_from_push.__wrapped__(str(calendar.id))  # type: ignore[attr-defined]

    titles = (await session.execute(select(CalendarEvent.title).where(CalendarEvent.calendar_id == calendar.id))).scalars().all()
    assert titles == ["Added in Notion"]
    assert commits[-2:] == ["commit", "publish"]
    message = None
    for _ in range(5):  # The first read returns the subscribe confirmation as None.
      if message := await pubsub.get_message(ignore_subscribe_messages=True, timeout=1):
        break
    assert message is not None and message["data"] == "sync"
    await pubsub.aclose()

  @pytest.mark.asyncio
  async def test_busy_account_retries_instead_of_dropping_the_change(
    self, save_fixture: SaveFixture, google: FakeGoogleCalendar, redis: Redis, worker: None, job_queue_manager: JobQueueManager, commits: list[str]
  ) -> None:
    calendar = _calendar("work")
    account = await _google_account(save_fixture, await _user(save_fixture), calendar)
    await push.request_push_sync(redis, calendar.id)
    job_queue_manager._enqueued_jobs.clear()

    try:
      async with account_lock(redis, account.id):
        await tasks.sync_calendar_from_push.__wrapped__(str(calendar.id), 3)  # type: ignore[attr-defined]

      assert _enqueued(job_queue_manager) == [(push.PUSH_SYNC_ACTOR, (str(calendar.id), 4), push.BUSY_RETRY_DELAY_MS)]
      assert "publish" not in commits
      # Still pending, so further notifications don't pile up more runs.
      assert not await push.request_push_sync(redis, calendar.id)
    finally:
      await _drain_pending(redis, calendar.id)

  @pytest.mark.asyncio
  async def test_gives_up_after_the_retry_limit_and_reopens_for_notifications(
    self, save_fixture: SaveFixture, google: FakeGoogleCalendar, redis: Redis, worker: None, job_queue_manager: JobQueueManager
  ) -> None:
    calendar = _calendar("work")
    account = await _google_account(save_fixture, await _user(save_fixture), calendar)
    await push.request_push_sync(redis, calendar.id)
    job_queue_manager._enqueued_jobs.clear()

    try:
      async with account_lock(redis, account.id):
        await tasks.sync_calendar_from_push.__wrapped__(str(calendar.id), push.MAX_BUSY_RETRIES)  # type: ignore[attr-defined]
      assert job_queue_manager._enqueued_jobs == []
      assert await push.request_push_sync(redis, calendar.id)
    finally:
      await _drain_pending(redis, calendar.id)

  @pytest.mark.asyncio
  async def test_a_notification_during_the_fetch_schedules_another_run(
    self,
    save_fixture: SaveFixture,
    google: FakeGoogleCalendar,
    redis: Redis,
    worker: None,
    job_queue_manager: JobQueueManager,
    mocker: MockerFixture,
  ) -> None:
    calendar = _calendar("work")
    await _google_account(save_fixture, await _user(save_fixture), calendar)
    await push.request_push_sync(redis, calendar.id)
    job_queue_manager._enqueued_jobs.clear()
    scheduled_mid_fetch: list[bool] = []
    real_list = GoogleCalendarClient.list_events

    async def list_events(self: GoogleCalendarClient, *args: object) -> object:
      scheduled_mid_fetch.append(await push.request_push_sync(redis, calendar.id))
      return await real_list(self, *args)  # type: ignore[arg-type]

    mocker.patch.object(GoogleCalendarClient, "list_events", list_events)
    try:
      await tasks.sync_calendar_from_push.__wrapped__(str(calendar.id))  # type: ignore[attr-defined]
      assert scheduled_mid_fetch == [True]
      assert _enqueued(job_queue_manager) == [(push.PUSH_SYNC_ACTOR, (str(calendar.id),), push.PUSH_SYNC_DELAY_MS)]
    finally:
      await _drain_pending(redis, calendar.id)

  @pytest.mark.asyncio
  async def test_provider_failure_leaves_events_alone(
    self, session: AsyncSession, save_fixture: SaveFixture, google: FakeGoogleCalendar, redis: Redis, worker: None, mocker: MockerFixture, commits: list[str]
  ) -> None:
    calendar = _calendar("work")
    await _google_account(save_fixture, await _user(save_fixture), calendar)
    mocker.patch.object(GoogleCalendarClient, "refresh_access_token", side_effect=ProviderAuthError("revoked"))

    await tasks.sync_calendar_from_push.__wrapped__(str(calendar.id))  # type: ignore[attr-defined]

    assert "publish" not in commits

  @pytest.mark.asyncio
  async def test_deleted_calendar_is_a_no_op(self, redis: Redis, worker: None, commits: list[str]) -> None:
    missing = uuid4()
    await tasks.sync_calendar_from_push.__wrapped__(str(missing))  # type: ignore[attr-defined]
    assert commits == ["commit"]


class TestAccountSync:
  @pytest.mark.asyncio
  async def test_publishes_after_commit_then_opens_channels(
    self, session: AsyncSession, save_fixture: SaveFixture, google: FakeGoogleCalendar, redis: Redis, worker: None, commits: list[str], mocker: MockerFixture
  ) -> None:
    account = await _google_account(save_fixture, await _user(save_fixture))
    mocker.patch.object(GoogleCalendarClient, "list_calendars", return_value=[ProviderCalendar("work", "Work", "#4986e7")])

    await tasks.sync_calendar_account.__wrapped__(str(account.id))  # type: ignore[attr-defined]

    assert commits.index("publish") > commits.index("commit")
    calendar = (await session.execute(select(Calendar).where(Calendar.account_id == account.id))).scalar_one()
    assert calendar.push_channel_id in google.channels

  @pytest.mark.asyncio
  async def test_failure_is_published_after_it_is_recorded(
    self, session: AsyncSession, save_fixture: SaveFixture, google: FakeGoogleCalendar, redis: Redis, worker: None, commits: list[str], mocker: MockerFixture
  ) -> None:
    account = await _google_account(save_fixture, await _user(save_fixture))
    mocker.patch.object(GoogleCalendarClient, "refresh_access_token", side_effect=ProviderAuthError("Access was revoked"))

    await tasks.sync_calendar_account.__wrapped__(str(account.id))  # type: ignore[attr-defined]

    assert commits == ["commit", "commit", "publish"]
    await session.refresh(account)
    assert account.sync_error == "Access was revoked. Reconnect the account."
    assert google.channels == {}

  @pytest.mark.asyncio
  async def test_busy_account_neither_publishes_nor_renews(
    self, save_fixture: SaveFixture, google: FakeGoogleCalendar, redis: Redis, worker: None, commits: list[str]
  ) -> None:
    account = await _google_account(save_fixture, await _user(save_fixture), _calendar("work"))
    async with account_lock(redis, account.id):
      await tasks.sync_calendar_account.__wrapped__(str(account.id))  # type: ignore[attr-defined]
    assert commits == [] and google.channels == {}


class TestICloudCheck:
  async def _account(self, save_fixture: SaveFixture) -> tuple[CalendarAccount, Calendar]:
    calendar = Calendar(external_id="https://caldav/home/", name="Home", color="#ffffff", change_tag="tag-1")
    account = CalendarAccount(
      user_id=(await _user(save_fixture)).id, provider=CalendarProvider.icloud, email="me@icloud.com", encrypted_credentials=encrypt("pw")
    )
    await save_fixture(account)
    calendar.account_id = account.id
    await save_fixture(calendar)
    return account, calendar

  @pytest.mark.parametrize(
    ("listed", "syncs"),
    [
      ([ProviderCalendar("https://caldav/home/", "Home", "#ffffff", change_tag="tag-1")], False),
      ([ProviderCalendar("https://caldav/home/", "Home", "#ffffff", change_tag="tag-2")], True),
      ([], True),
      (
        [
          ProviderCalendar("https://caldav/home/", "Home", "#ffffff", change_tag="tag-1"),
          ProviderCalendar("https://caldav/new/", "New", "#ffffff", change_tag="x"),
        ],
        True,
      ),
    ],
    ids=["unchanged", "changed", "calendar-removed", "calendar-added"],
  )
  @pytest.mark.asyncio
  async def test_syncs_only_when_something_changed(
    self,
    save_fixture: SaveFixture,
    worker: None,
    job_queue_manager: JobQueueManager,
    mocker: MockerFixture,
    listed: list[ProviderCalendar],
    syncs: bool,
  ) -> None:
    account, _ = await self._account(save_fixture)
    mocker.patch.object(calendar_service, "fetch_icloud_calendars", return_value=listed)

    await tasks.check_icloud_calendar_account.__wrapped__(str(account.id))  # type: ignore[attr-defined]

    expected = [("sync_calendar_account", (str(account.id),), None)] if syncs else []
    assert _enqueued(job_queue_manager) == expected

  @pytest.mark.asyncio
  async def test_unreachable_icloud_waits_for_the_next_check(
    self, save_fixture: SaveFixture, worker: None, job_queue_manager: JobQueueManager, mocker: MockerFixture
  ) -> None:
    account, _ = await self._account(save_fixture)
    mocker.patch.object(calendar_service, "fetch_icloud_calendars", side_effect=httpx.ConnectError("down"))

    await tasks.check_icloud_calendar_account.__wrapped__(str(account.id))  # type: ignore[attr-defined]

    assert job_queue_manager._enqueued_jobs == []

  @pytest.mark.asyncio
  async def test_cron_fans_out_to_icloud_accounts_only(self, save_fixture: SaveFixture, worker: None, job_queue_manager: JobQueueManager) -> None:
    icloud, _ = await self._account(save_fixture)
    await _google_account(save_fixture, await _user(save_fixture))

    await tasks.check_icloud_calendar_accounts.__wrapped__()  # type: ignore[attr-defined]

    assert _enqueued(job_queue_manager) == [(tasks.CHECK_ICLOUD_ACTOR, (str(icloud.id),), None)]

  @pytest.mark.asyncio
  async def test_sync_records_the_ctag(self, session: AsyncSession, save_fixture: SaveFixture) -> None:
    account, calendar = await self._account(save_fixture)
    await CalendarRepository.from_session(session).sync_for_account(account, [ProviderCalendar(calendar.external_id, "Home", "#ffffff", change_tag="tag-9")])
    await session.refresh(calendar)
    assert calendar.change_tag == "tag-9"


class TestChangeStream:
  @pytest.mark.asyncio
  async def test_relays_changes_and_heartbeats(self, redis: Redis) -> None:
    user_id = uuid4()
    stream = push.change_events(redis, user_id, heartbeat_seconds=0.2)
    try:
      assert await anext(stream) == ": connected\n\n"
      assert await anext(stream) == ": ping\n\n"
      next_event = asyncio.ensure_future(anext(stream))
      await asyncio.sleep(0.05)
      await push.publish_change(redis, user_id)
      assert await next_event == "event: changed\ndata: {}\n\n"
    finally:
      await stream.aclose()

  @pytest.mark.asyncio
  async def test_only_the_users_own_changes(self, redis: Redis) -> None:
    mine, theirs = uuid4(), uuid4()
    stream = push.change_events(redis, mine, heartbeat_seconds=0.3)
    try:
      await anext(stream)
      next_event = asyncio.ensure_future(anext(stream))
      await asyncio.sleep(0.05)
      await push.publish_change(redis, theirs)
      assert await next_event == ": ping\n\n"
    finally:
      await stream.aclose()

  @pytest.mark.asyncio
  async def test_closing_the_stream_unsubscribes(self, redis: Redis) -> None:
    user_id = uuid4()
    stream = push.change_events(redis, user_id)
    await anext(stream)
    assert (await redis.pubsub_numsub(push.changes_channel(user_id)))[0][1] == 1
    await stream.aclose()
    assert (await redis.pubsub_numsub(push.changes_channel(user_id)))[0][1] == 0

  @pytest.mark.asyncio
  async def test_ends_after_its_lifetime_and_frees_its_slot(self, redis: Redis) -> None:
    user_id = uuid4()
    slot = await push.claim_stream_slot(redis, user_id)

    events = [event async for event in push.change_events(redis, user_id, slot=slot, heartbeat_seconds=0.05, lifetime_seconds=0.2)]

    assert events[0] == ": connected\n\n" and set(events[1:]) == {": ping\n\n"}
    assert await redis.zcard(f"calendars:streams:{user_id}") == 0

  @pytest.mark.asyncio
  async def test_disconnect_frees_the_slot_and_subscription(self, redis: Redis) -> None:
    user_id = uuid4()
    slot = await push.claim_stream_slot(redis, user_id)
    stream = push.change_events(redis, user_id, slot=slot)
    connected = anyio.Event()

    async def consume() -> None:
      async for _ in stream:
        connected.set()

    # Starlette cancels the stream like this when the client goes away.
    async with anyio.create_task_group() as task_group:
      task_group.start_soon(consume)
      await connected.wait()
      task_group.cancel_scope.cancel()

    assert await redis.zcard(f"calendars:streams:{user_id}") == 0
    assert (await redis.pubsub_numsub(push.changes_channel(user_id)))[0][1] == 0

  @pytest.mark.asyncio
  async def test_caps_open_streams_per_user(self, redis: Redis) -> None:
    user_id, other = uuid4(), uuid4()
    try:
      slots = [await push.claim_stream_slot(redis, user_id) for _ in range(push.MAX_STREAMS_PER_USER)]
      with pytest.raises(push.TooManyStreamsError):
        await push.claim_stream_slot(redis, user_id)
      await push.claim_stream_slot(redis, other)

      await redis.zrem(f"calendars:streams:{user_id}", slots[0])
      await push.claim_stream_slot(redis, user_id)
    finally:
      await redis.delete(f"calendars:streams:{user_id}", f"calendars:streams:{other}")

  @pytest.mark.asyncio
  async def test_slots_of_streams_that_never_closed_lapse(self, redis: Redis) -> None:
    user_id = uuid4()
    key = f"calendars:streams:{user_id}"
    lapsed = time.time() - push.STREAM_LIFETIME_SECONDS - push.STREAM_SLOT_GRACE_SECONDS - 1
    try:
      await redis.zadd(key, {f"dead-{i}": lapsed for i in range(push.MAX_STREAMS_PER_USER)})
      await push.claim_stream_slot(redis, user_id)
      assert await redis.zcard(key) == 1
    finally:
      await redis.delete(key)

  @pytest.mark.asyncio
  async def test_endpoint_refuses_streams_over_the_cap(self, client: AsyncClient, user: User, redis: Redis) -> None:
    key = f"calendars:streams:{user.id}"
    try:
      await redis.zadd(key, {f"open-{i}": time.time() for i in range(push.MAX_STREAMS_PER_USER)})
      resp = await client.get("/v1/calendars/changes")
      assert resp.status_code == 429
      assert await redis.zcard(key) == push.MAX_STREAMS_PER_USER
    finally:
      await redis.delete(key)


class TestDisconnect:
  @pytest.mark.asyncio
  async def test_stops_channels_before_revoking(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, google: FakeGoogleCalendar, mocker: MockerFixture
  ) -> None:
    assert (await client.get("/v1/calendars/accounts")).status_code == 200
    user = (await session.execute(select(User).where(User.auth0_sub == TEST_USER_INFO.sub))).scalar_one()
    google.channels["ch"] = ("work", WEBHOOK, "t", "r")
    account = await _google_account(save_fixture, user, _calendar("work", push_channel_id="ch", push_resource_id="r", push_token="t"))
    order: list[str] = []
    real_stop = GoogleCalendarClient.stop_channel

    async def stop(self: GoogleCalendarClient, *args: str) -> None:
      order.append("stop")
      await real_stop(self, *args)

    mocker.patch.object(GoogleCalendarClient, "stop_channel", stop)
    mocker.patch.object(GoogleCalendarClient, "revoke", side_effect=lambda *_: order.append("revoke"))

    assert (await client.delete(f"/v1/calendars/accounts/{account.id}")).status_code == 204
    assert order == ["stop", "revoke"]
    assert google.stopped == [("ch", "r")]
