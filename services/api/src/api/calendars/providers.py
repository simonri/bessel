import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Literal

from bs4 import BeautifulSoup

AttendeeResponse = Literal["accepted", "declined", "tentative", "needs_action"]

# Video links worth surfacing as "Join" when a provider has no structured
# conference data (e.g. a Zoom link pasted into the location or description).
_CONFERENCE_URL = re.compile(
  r"https://(?:[\w-]+\.)?(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|whereby\.com|facetime\.apple\.com)/[^\s<>\"')\]]+",
  re.IGNORECASE,
)


class ProviderError(Exception):
  """A calendar provider refused or failed a request."""


class ProviderAuthError(ProviderError):
  """The stored credentials were rejected; the user has to reconnect the account."""


class ProviderScopeError(ProviderError):
  """The account was connected without permission to change events."""


class ProviderForbiddenError(ProviderError):
  """The provider doesn't allow this change, e.g. editing someone else's invitation."""


class ProviderConflictError(ProviderError):
  """The event changed at the provider since it was last synced."""


class ProviderNotFoundError(ProviderError):
  """The event or calendar no longer exists at the provider."""


class ProviderRejectedError(ProviderError):
  """The provider refused the change as invalid; its message explains why."""


class ProviderUnavailableError(ProviderError):
  """The provider is rate limiting or erroring; worth retrying later."""


@dataclass(frozen=True, slots=True)
class ProviderCalendar:
  external_id: str
  name: str
  color: str
  hidden_by_default: bool = False
  writable: bool = False
  primary: bool = False
  # Changes whenever anything in the calendar does (CalDAV ctag); None where
  # the provider pushes changes instead.
  change_tag: str | None = None


@dataclass(frozen=True, slots=True)
class ProviderPerson:
  """Someone the account knows (a contact or colleague), for names and photos."""

  email: str
  name: str | None
  photo_url: str | None


@dataclass(frozen=True, slots=True)
class ProviderAttendee:
  email: str
  name: str | None
  response: AttendeeResponse
  # This account itself, and whoever organizes the event.
  is_self: bool = False
  is_organizer: bool = False


@dataclass(frozen=True, slots=True)
class ProviderEvent:
  external_id: str
  title: str
  location: str | None
  all_day: bool
  start_at: datetime | None = None
  end_at: datetime | None = None
  start_date: date | None = None
  end_date: date | None = None
  description: str | None = None
  creator_name: str | None = None
  creator_email: str | None = None
  attendees: list[ProviderAttendee] = field(default_factory=list)
  # The account's own reply when it's a guest; None when it isn't invited.
  my_response: AttendeeResponse | None = None
  conference_url: str | None = None
  html_link: str | None = None
  busy: bool = True
  recurring: bool = False
  visibility: str | None = None
  # Whether this account may change the event (not someone else's invitation).
  editable: bool = False
  # Identifies the recurring series and this occurrence's slot in it.
  series_id: str | None = None
  original_start: str | None = None
  rrule: str | None = None
  etag: str | None = None
  # Google only: the event's own colour ("1".."11"), overriding the calendar's.
  color_id: str | None = None
  # iCloud only: the .ics resource holding the event (and its whole series).
  resource_href: str | None = None


def normalize_color(value: str | None, fallback: str) -> str:
  """Providers hand out `#RRGGBB` or `#RRGGBBAA` (iCloud); keep the RGB part."""
  if value and value.startswith("#") and len(value) >= 7:
    return value[:7].lower()
  return fallback


def find_conference_url(*texts: str | None) -> str | None:
  for text in texts:
    if text and (match := _CONFERENCE_URL.search(text)):
      return match.group(0)
  return None


def html_to_text(value: str | None) -> str | None:
  """Google stores descriptions as light HTML; keep the text and line breaks only."""
  if not value:
    return None
  if "<" not in value:
    return value.strip() or None
  soup = BeautifulSoup(value, "html.parser")
  for br in soup.find_all("br"):
    br.replace_with("\n")
  for block in soup.find_all(["p", "div", "li"]):
    block.append("\n")
  for link in soup.find_all("a"):
    # Keep the destination when the visible text hides it.
    href = link.get("href")
    if isinstance(href, str) and href.startswith("http") and href not in link.get_text():
      link.append(f" ({href})")
  text = re.sub(r"\n{3,}", "\n\n", soup.get_text()).strip()
  return text or None
