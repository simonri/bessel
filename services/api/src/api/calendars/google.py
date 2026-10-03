from dataclasses import dataclass, replace
from datetime import UTC, date, datetime
from typing import Any
from urllib.parse import quote, urlencode

import httpx

from api.calendars.providers import (
  AttendeeResponse,
  ProviderAttendee,
  ProviderAuthError,
  ProviderCalendar,
  ProviderConflictError,
  ProviderEvent,
  ProviderForbiddenError,
  ProviderNotFoundError,
  ProviderRejectedError,
  ProviderScopeError,
  ProviderUnavailableError,
  find_conference_url,
  html_to_text,
  normalize_color,
)
from api.settings import settings

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
API_URL = "https://www.googleapis.com/calendar/v3"
# calendar.events alone can't list calendars, so both are requested. Users can
# untick scopes on Google's consent screen, so writes check what was granted.
READ_SCOPE = "https://www.googleapis.com/auth/calendar.readonly"
WRITE_SCOPE = "https://www.googleapis.com/auth/calendar.events"
SCOPES = f"openid email {READ_SCOPE} {WRITE_SCOPE}"
WRITABLE_ACCESS_ROLES = frozenset({"owner", "writer"})
# Gmail-generated, birthday, focus time etc. have restricted editing; only
# ordinary events are offered for editing.
EDITABLE_EVENT_TYPES = frozenset({"default"})
DEFAULT_COLOR = "#4285f4"


def redirect_uri() -> str:
  return f"{settings.FRONTEND_BASE_URL}/oauth/google-calendar"


def authorize_url(state: str) -> str:
  params = {
    "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
    "redirect_uri": redirect_uri(),
    "response_type": "code",
    "scope": SCOPES,
    # offline + consent so Google issues a refresh token even on reconnect.
    "access_type": "offline",
    "prompt": "consent",
    "include_granted_scopes": "true",
    "state": state,
  }
  return f"{AUTHORIZE_URL}?{urlencode(params)}"


_RESPONSES: dict[str, AttendeeResponse] = {
  "accepted": "accepted",
  "declined": "declined",
  "tentative": "tentative",
  "needsAction": "needs_action",
}


def _conference_url(item: dict[str, Any], description: str | None) -> str | None:
  for entry in item.get("conferenceData", {}).get("entryPoints", []):
    if entry.get("entryPointType") == "video" and entry.get("uri"):
      return entry["uri"]
  return item.get("hangoutLink") or find_conference_url(item.get("location"), description)


def _is_editable(item: dict[str, Any]) -> bool:
  if item.get("eventType", "default") not in EDITABLE_EVENT_TYPES or item.get("locked"):
    return False
  # `organizer.self` means this calendar owns the event; otherwise it's an
  # invitation and only editable when the organizer allows guests to modify.
  organizer = item.get("organizer")
  return not organizer or bool(organizer.get("self") or item.get("guestsCanModify"))


def _rrule(recurrence: list[str]) -> str | None:
  return next((line.removeprefix("RRULE:") for line in recurrence if line.startswith("RRULE:")), None)


def _original_start(item: dict[str, Any]) -> str | None:
  original = item.get("originalStartTime")
  if not original:
    return None
  return original.get("dateTime") or original.get("date")


def _parse_event(item: dict[str, Any]) -> ProviderEvent | None:
  if item.get("status") == "cancelled":
    return None
  start, end = item.get("start", {}), item.get("end", {})
  # `creator` is who made the event; `organizer` is often the calendar itself.
  creator = item.get("creator") or item.get("organizer") or {}
  description = html_to_text(item.get("description"))
  details = {
    "external_id": item["id"],
    "title": item.get("summary") or "(No title)",
    "location": item.get("location"),
    "description": description,
    "creator_name": creator.get("displayName"),
    "creator_email": creator.get("email"),
    "attendees": [
      ProviderAttendee(email=a["email"], name=a.get("displayName"), response=_RESPONSES.get(a.get("responseStatus", ""), "needs_action"))
      for a in item.get("attendees", [])
      if a.get("email") and not a.get("resource")
    ],
    "my_response": next(
      (_RESPONSES.get(a.get("responseStatus", ""), "needs_action") for a in item.get("attendees", []) if a.get("self")),
      None,
    ),
    "conference_url": _conference_url(item, description),
    "html_link": item.get("htmlLink"),
    "busy": item.get("transparency") != "transparent",
    "recurring": "recurringEventId" in item,
    "visibility": item.get("visibility") if item.get("visibility") in ("public", "private", "confidential") else None,
    "editable": _is_editable(item),
    "series_id": item.get("recurringEventId"),
    "original_start": _original_start(item),
    "etag": item.get("etag"),
  }
  if "date" in start:
    return ProviderEvent(**details, all_day=True, start_date=date.fromisoformat(start["date"]), end_date=date.fromisoformat(end["date"]))
  if "dateTime" in start:
    return ProviderEvent(**details, all_day=False, start_at=datetime.fromisoformat(start["dateTime"]), end_at=datetime.fromisoformat(end["dateTime"]))
  return None


@dataclass(frozen=True, slots=True)
class GoogleGrant:
  access_token: str
  # Absent when Google didn't reissue one (reconnecting an existing grant).
  refresh_token: str | None
  can_write: bool


@dataclass(frozen=True, slots=True)
class GoogleChannel:
  """A push channel Google opened for a calendar's events."""

  resource_id: str
  expires_at: datetime


class GoogleCalendarClient:
  def __init__(self, http: httpx.AsyncClient) -> None:
    self.http = http

  async def exchange_code(self, code: str) -> GoogleGrant:
    data = await self._token_request({"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri()})
    return GoogleGrant(
      access_token=data["access_token"],
      refresh_token=data.get("refresh_token"),
      can_write=WRITE_SCOPE in data.get("scope", "").split(),
    )

  async def refresh_access_token(self, refresh_token: str) -> GoogleGrant:
    data = await self._token_request({"grant_type": "refresh_token", "refresh_token": refresh_token})
    return GoogleGrant(access_token=data["access_token"], refresh_token=None, can_write=WRITE_SCOPE in data.get("scope", "").split())

  async def get_email(self, access_token: str) -> str:
    response = await self.http.get(USERINFO_URL, headers=_auth(access_token))
    response.raise_for_status()
    return response.json()["email"]

  async def list_calendars(self, access_token: str) -> list[ProviderCalendar]:
    items = await self._paginate(f"{API_URL}/users/me/calendarList", access_token, {})
    return [
      ProviderCalendar(
        external_id=item["id"],
        name=item.get("summaryOverride") or item.get("summary") or item["id"],
        color=normalize_color(item.get("backgroundColor"), DEFAULT_COLOR),
        hidden_by_default=not item.get("selected", False),
        writable=item.get("accessRole") in WRITABLE_ACCESS_ROLES,
        primary=bool(item.get("primary")),
      )
      for item in items
      if not item.get("deleted")
    ]

  async def list_events(self, access_token: str, calendar_id: str, start: datetime, end: datetime) -> list[ProviderEvent]:
    params = {
      "timeMin": start.isoformat(),
      "timeMax": end.isoformat(),
      "singleEvents": "true",
      "maxResults": "2500",
    }
    url = f"{API_URL}/calendars/{quote(calendar_id, safe='')}/events"
    items = await self._paginate(url, access_token, params)
    # Expanded instances don't carry their series' RRULE; the parents do.
    parents = await self._paginate(url, access_token, {**params, "singleEvents": "false"})
    rules = {parent["id"]: rule for parent in parents if (rule := _rrule(parent.get("recurrence", [])))}
    return [replace(event, rrule=rules.get(event.series_id)) if event.series_id else event for item in items if (event := _parse_event(item)) is not None]

  async def get_event(self, access_token: str, calendar_id: str, event_id: str) -> dict[str, Any]:
    response = await self.http.get(_event_url(calendar_id, event_id), headers=_auth(access_token))
    return _write_result(response)

  async def create_event(self, access_token: str, calendar_id: str, body: dict[str, Any], *, send_updates: bool) -> dict[str, Any]:
    response = await self.http.post(
      f"{API_URL}/calendars/{quote(calendar_id, safe='')}/events",
      headers=_auth(access_token),
      params=_write_params(send_updates),
      json=body,
    )
    return _write_result(response)

  async def patch_event(
    self,
    access_token: str,
    calendar_id: str,
    event_id: str,
    body: dict[str, Any],
    *,
    etag: str | None,
    send_updates: bool,
  ) -> dict[str, Any]:
    response = await self.http.patch(
      _event_url(calendar_id, event_id),
      headers=_auth(access_token, etag),
      params=_write_params(send_updates),
      json=body,
    )
    return _write_result(response)

  async def delete_event(self, access_token: str, calendar_id: str, event_id: str, *, etag: str | None, send_updates: bool) -> None:
    response = await self.http.delete(
      _event_url(calendar_id, event_id),
      headers=_auth(access_token, etag),
      params={"sendUpdates": "all" if send_updates else "none"},
    )
    # Deleting something already gone is the outcome the caller wanted.
    if response.status_code not in (404, 410):
      _write_result(response, expect_body=False)

  async def move_event(self, access_token: str, calendar_id: str, event_id: str, destination: str, *, send_updates: bool) -> dict[str, Any]:
    response = await self.http.post(
      f"{_event_url(calendar_id, event_id)}/move",
      headers=_auth(access_token),
      params={"destination": destination, "sendUpdates": "all" if send_updates else "none"},
    )
    return _write_result(response)

  async def watch_events(self, access_token: str, calendar_id: str, *, channel_id: str, address: str, token: str) -> GoogleChannel:
    """Asks Google to POST to `address` whenever the calendar's events change."""
    response = await self.http.post(
      f"{API_URL}/calendars/{quote(calendar_id, safe='')}/events/watch",
      headers=_auth(access_token),
      json={"id": channel_id, "type": "web_hook", "address": address, "token": token},
    )
    body = _write_result(response)
    return GoogleChannel(resource_id=body["resourceId"], expires_at=datetime.fromtimestamp(int(body["expiration"]) / 1000, UTC))

  async def stop_channel(self, access_token: str, channel_id: str, resource_id: str) -> None:
    response = await self.http.post(
      f"{API_URL}/channels/stop",
      headers=_auth(access_token),
      json={"id": channel_id, "resourceId": resource_id},
    )
    # A channel that already expired is as stopped as it gets.
    if response.status_code != 404:
      _write_result(response, expect_body=False)

  async def revoke(self, token: str) -> None:
    await self.http.post(REVOKE_URL, data={"token": token})

  async def _token_request(self, data: dict[str, str]) -> dict[str, Any]:
    response = await self.http.post(
      TOKEN_URL,
      data={**data, "client_id": settings.GOOGLE_OAUTH_CLIENT_ID, "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET},
    )
    if response.status_code in (400, 401) and _error_code(response) == "invalid_grant":
      raise ProviderAuthError("Google access was revoked or expired")
    response.raise_for_status()
    return response.json()

  async def _paginate(self, url: str, access_token: str, params: dict[str, str]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    page_token: str | None = None
    while True:
      response = await self.http.get(url, headers=_auth(access_token), params={**params, **({"pageToken": page_token} if page_token else {})})
      if response.status_code == 401:
        raise ProviderAuthError("Google rejected the access token")
      response.raise_for_status()
      body = response.json()
      items.extend(body.get("items", []))
      page_token = body.get("nextPageToken")
      if not page_token:
        return items


def _event_url(calendar_id: str, event_id: str) -> str:
  return f"{API_URL}/calendars/{quote(calendar_id, safe='')}/events/{quote(event_id, safe='')}"


def _write_params(send_updates: bool) -> dict[str, str]:
  # conferenceDataVersion=1 makes Google keep (and create) Meet links on writes.
  return {"sendUpdates": "all" if send_updates else "none", "conferenceDataVersion": "1"}


_SCOPE_REASONS = frozenset({"insufficientPermissions", "ACCESS_TOKEN_SCOPE_INSUFFICIENT"})
_RATE_LIMIT_REASONS = frozenset({"rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"})


def _error_reasons(response: httpx.Response) -> tuple[set[str], str]:
  try:
    error = response.json().get("error", {})
  except ValueError:
    return set(), response.text[:200]
  if not isinstance(error, dict):
    return {str(error)}, str(error)
  reasons = {e.get("reason", "") for e in error.get("errors", [])}
  reasons |= {d.get("reason", "") for d in error.get("details", []) if isinstance(d, dict)}
  return reasons - {""}, str(error.get("message", ""))


def _write_result(response: httpx.Response, *, expect_body: bool = True) -> dict[str, Any]:
  """Maps Google's error responses onto provider errors the API can explain."""
  status = response.status_code
  if status < 400:
    return response.json() if expect_body and response.content else {}
  reasons, message = _error_reasons(response)
  if status == 401:
    raise ProviderAuthError("Google rejected the access token")
  if status == 403 and reasons & _SCOPE_REASONS:
    raise ProviderScopeError("Bessel isn't allowed to change events in this Google account")
  if status in (403, 429) and reasons & _RATE_LIMIT_REASONS or status == 429 or status >= 500:
    raise ProviderUnavailableError("Google Calendar is busy, try again in a moment")
  if status == 403:
    raise ProviderForbiddenError(message or "Google doesn't allow changing this event")
  if status in (404, 410):
    raise ProviderNotFoundError("The event no longer exists in Google Calendar")
  if status in (409, 412):
    raise ProviderConflictError("The event changed in Google Calendar")
  raise ProviderRejectedError(message or f"Google Calendar rejected the change ({status})")


def _error_code(response: httpx.Response) -> str | None:
  try:
    return response.json().get("error")
  except ValueError:
    return None


def _auth(access_token: str, etag: str | None = None) -> dict[str, str]:
  headers = {"Authorization": f"Bearer {access_token}"}
  if etag:
    headers["If-Match"] = etag
  return headers
