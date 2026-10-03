from dataclasses import dataclass
from datetime import date, datetime


class ProviderAuthError(Exception):
  """The stored credentials were rejected; the user has to reconnect the account."""


@dataclass(frozen=True, slots=True)
class ProviderCalendar:
  external_id: str
  name: str
  color: str
  hidden_by_default: bool = False


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


def normalize_color(value: str | None, fallback: str) -> str:
  """Providers hand out `#RRGGBB` or `#RRGGBBAA` (iCloud); keep the RGB part."""
  if value and value.startswith("#") and len(value) >= 7:
    return value[:7].lower()
  return fallback
