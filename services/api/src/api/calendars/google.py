from datetime import date, datetime
from typing import Any
from urllib.parse import quote, urlencode

import httpx

from api.calendars.providers import (
  AttendeeResponse,
  ProviderAttendee,
  ProviderAuthError,
  ProviderCalendar,
  ProviderEvent,
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
SCOPES = "openid email https://www.googleapis.com/auth/calendar.readonly"
DEFAULT_COLOR = "#4285f4"


def redirect_uri() -> str:
  return f"{settings.API_BASE_URL}/v1/calendars/google/callback"


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
    "conference_url": _conference_url(item, description),
    "html_link": item.get("htmlLink"),
    "busy": item.get("transparency") != "transparent",
    "recurring": "recurringEventId" in item,
    "visibility": item.get("visibility") if item.get("visibility") in ("public", "private", "confidential") else None,
  }
  if "date" in start:
    return ProviderEvent(**details, all_day=True, start_date=date.fromisoformat(start["date"]), end_date=date.fromisoformat(end["date"]))
  if "dateTime" in start:
    return ProviderEvent(**details, all_day=False, start_at=datetime.fromisoformat(start["dateTime"]), end_at=datetime.fromisoformat(end["dateTime"]))
  return None


class GoogleCalendarClient:
  def __init__(self, http: httpx.AsyncClient) -> None:
    self.http = http

  async def exchange_code(self, code: str) -> tuple[str, str | None]:
    """Returns (access_token, refresh_token). The refresh token is absent if Google didn't reissue one."""
    data = await self._token_request({"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri()})
    return data["access_token"], data.get("refresh_token")

  async def refresh_access_token(self, refresh_token: str) -> str:
    data = await self._token_request({"grant_type": "refresh_token", "refresh_token": refresh_token})
    return data["access_token"]

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
    items = await self._paginate(f"{API_URL}/calendars/{quote(calendar_id, safe='')}/events", access_token, params)
    return [event for item in items if (event := _parse_event(item)) is not None]

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


def _error_code(response: httpx.Response) -> str | None:
  try:
    return response.json().get("error")
  except ValueError:
    return None


def _auth(access_token: str) -> dict[str, str]:
  return {"Authorization": f"Bearer {access_token}"}
