"""Reading a Google account's contacts through the People API."""

from dataclasses import dataclass, field
from typing import Any

import httpx

from api.calendars.google import PEOPLE_API_URL
from api.calendars.providers import ProviderAuthError, ProviderNotFoundError, ProviderRejectedError, ProviderScopeError, ProviderUnavailableError

# Every request in a sync, including its later pages and incremental runs, must repeat these exactly.
PERSON_FIELDS = "metadata,names,nicknames,emailAddresses,phoneNumbers,addresses,birthdays,organizations,photos,biographies,urls"
SOURCES = "READ_SOURCE_TYPE_CONTACT"
PAGE_SIZE = "1000"
# A runaway sync stops here; address books are far smaller.
MAX_PAGES = 50


def _auth(access_token: str) -> dict[str, str]:
  return {"Authorization": f"Bearer {access_token}"}


class SyncTokenExpired(Exception):
  """Google forgot the sync token (they last 7 days): the next sync must be a full one."""


@dataclass(slots=True)
class ConnectionsPage:
  """People changed since the sync token (or all of them, on a full sync), with the token for next time."""

  people: list[dict[str, Any]] = field(default_factory=list)
  next_sync_token: str | None = None
  full: bool = False


class GoogleContactsClient:
  def __init__(self, http: httpx.AsyncClient) -> None:
    self.http = http

  async def list_connections(self, access_token: str, sync_token: str | None) -> ConnectionsPage:
    result = ConnectionsPage(full=sync_token is None)
    base: dict[str, str] = {"personFields": PERSON_FIELDS, "sources": SOURCES, "pageSize": PAGE_SIZE, "requestSyncToken": "true"}
    if sync_token:
      base["syncToken"] = sync_token
    page_token: str | None = None
    for _ in range(MAX_PAGES):
      params = {**base, **({"pageToken": page_token} if page_token else {})}
      response = await self.http.get(f"{PEOPLE_API_URL}/people/me/connections", headers=_auth(access_token), params=params)
      if _is_expired_token(response):
        raise SyncTokenExpired
      if response.status_code in (401, 403):
        raise ProviderAuthError("Google refused access to contacts")
      if response.status_code >= 500 or response.status_code == 429:
        raise ProviderUnavailableError(f"Google contacts answered {response.status_code}")
      response.raise_for_status()
      data = response.json()
      result.people.extend(data.get("connections", []))
      page_token = data.get("nextPageToken")
      if not page_token:
        result.next_sync_token = data.get("nextSyncToken")
        return result
    raise ProviderUnavailableError("Google contacts kept paging")

  async def get_person(self, access_token: str, resource_name: str) -> dict[str, Any]:
    response = await self.http.get(f"{PEOPLE_API_URL}/{resource_name}", headers=_auth(access_token), params={"personFields": PERSON_FIELDS})
    _raise_for_write(response)
    return response.json()

  async def update_contact(self, access_token: str, person: dict[str, Any], fields: list[str]) -> dict[str, Any]:
    """Replaces `fields` of the person with what `person` holds; its etag must be the latest."""
    response = await self.http.patch(
      f"{PEOPLE_API_URL}/{person['resourceName']}:updateContact",
      headers=_auth(access_token),
      params={"updatePersonFields": ",".join(fields), "personFields": PERSON_FIELDS},
      json=person,
    )
    _raise_for_write(response)
    return response.json()

  async def create_contact(self, access_token: str, person: dict[str, Any]) -> dict[str, Any]:
    response = await self.http.post(f"{PEOPLE_API_URL}/people:createContact", headers=_auth(access_token), params={"personFields": PERSON_FIELDS}, json=person)
    _raise_for_write(response)
    return response.json()

  async def delete_contact(self, access_token: str, resource_name: str) -> None:
    response = await self.http.delete(f"{PEOPLE_API_URL}/{resource_name}:deleteContact", headers=_auth(access_token))
    if response.status_code == 404:
      return
    _raise_for_write(response)


class StaleEtag(Exception):
  """The person changed in Google since Bessel last read it."""


def _raise_for_write(response: httpx.Response) -> None:
  if response.is_success:
    return
  if response.status_code == 400 and "failedprecondition" in response.text.lower().replace("_", ""):
    raise StaleEtag
  if response.status_code == 401:
    raise ProviderAuthError("Google refused access to contacts")
  if response.status_code == 403:
    raise ProviderScopeError("Google hasn't allowed Bessel to change contacts")
  if response.status_code == 404:
    raise ProviderNotFoundError("That contact no longer exists in Google")
  if response.status_code == 400:
    message = response.json().get("error", {}).get("message", "Google refused the change") if response.content else "Google refused the change"
    raise ProviderRejectedError(message)
  raise ProviderUnavailableError(f"Google contacts answered {response.status_code}")


def _is_expired_token(response: httpx.Response) -> bool:
  if response.status_code == 410:
    return True
  if response.status_code != 400:
    return False
  try:
    details = response.json().get("error", {})
  except ValueError:
    return False
  reasons = {d.get("reason") for d in details.get("details", []) if isinstance(d, dict)}
  return "EXPIRED_SYNC_TOKEN" in reasons or "EXPIRED_SYNC_TOKEN" in str(details.get("message", ""))
