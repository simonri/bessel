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


class ProviderAuthError(Exception):
  """The stored credentials were rejected; the user has to reconnect the account."""


@dataclass(frozen=True, slots=True)
class ProviderCalendar:
  external_id: str
  name: str
  color: str
  hidden_by_default: bool = False


@dataclass(frozen=True, slots=True)
class ProviderAttendee:
  email: str
  name: str | None
  response: AttendeeResponse


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
  conference_url: str | None = None
  html_link: str | None = None
  busy: bool = True
  recurring: bool = False
  visibility: str | None = None


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
