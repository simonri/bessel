"""Names and photos for the people on events, from the Google account's own
contacts and company directory (Google Calendar itself rarely includes them).

Only people who appear on the account's synced events are stored: Bessel needs
to name guests, not to hold a copy of the address book.
"""

from datetime import timedelta
from uuid import UUID

from api.calendars import http as provider_http
from api.calendars.google import GoogleCalendarClient
from api.calendars.push import SessionMaker
from api.calendars.repository import CalendarAccountRepository, CalendarEventRepository, CalendarPersonRepository
from api.common.encryption import decrypt
from api.common.utils import utc_now
from api.models.calendar_account import CalendarProvider

REFRESH_EVERY = timedelta(hours=12)


async def refresh_people(session_maker: SessionMaker, account_id: UUID) -> bool:
  """Refetches the account's people when due; returns whether it did. No
  database session is held while Google responds."""
  async with session_maker() as session:
    account = await CalendarAccountRepository.from_session(session).get_by_id(account_id)
    if account is None or account.provider != CalendarProvider.google or not account.can_read_people:
      return False
    if account.people_synced_at is not None and account.people_synced_at > utc_now() - REFRESH_EVERY:
      return False
    credentials = account.encrypted_credentials

  async with provider_http.client() as http:
    google = GoogleCalendarClient(http)
    grant = await google.refresh_access_token(decrypt(credentials))
    if not grant.can_read_people:
      return False
    people = await google.list_people(grant.access_token)

  async with session_maker() as session:
    account = await CalendarAccountRepository.from_session(session).get_by_id(account_id)
    if account is None:
      return False
    on_events = await CalendarEventRepository.from_session(session).emails_for_account(account)
    await CalendarPersonRepository.from_session(session).replace_for_account(account, [p for p in people if p.email in on_events])
    account.people_synced_at = utc_now()
  return True
