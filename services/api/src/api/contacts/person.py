"""Turning a People API person into what Bessel lists, searches and shows."""

from dataclasses import dataclass, field
from typing import Any

from api.models.contact import ContactMethodKind


@dataclass(frozen=True, slots=True)
class ParsedMethod:
  kind: ContactMethodKind
  label: str | None
  value: str


@dataclass(frozen=True, slots=True)
class ParsedPerson:
  resource_name: str
  etag: str | None
  deleted: bool
  # The person exactly as Google sent it.
  raw: dict[str, Any] = field(default_factory=dict)
  display_name: str = ""
  given_name: str | None = None
  family_name: str | None = None
  nickname: str | None = None
  organization: str | None = None
  job_title: str | None = None
  birthday_month: int | None = None
  birthday_day: int | None = None
  birthday_year: int | None = None
  photo_url: str | None = None
  notes: str | None = None
  methods: list[ParsedMethod] = field(default_factory=list)


def _primary(items: list[dict[str, Any]]) -> dict[str, Any] | None:
  """The entry Google marks primary, else the first."""
  return next((i for i in items if i.get("metadata", {}).get("primary")), items[0] if items else None)


def _text(value: Any) -> str | None:
  return value.strip() or None if isinstance(value, str) else None


def _label(item: dict[str, Any]) -> str | None:
  return _text(item.get("formattedType")) or _text(item.get("type"))


def _address(item: dict[str, Any]) -> str | None:
  if formatted := _text(item.get("formattedValue")):
    return formatted
  parts = [item.get(k) for k in ("streetAddress", "extendedAddress", "postalCode", "city", "region", "country")]
  return _text(", ".join(p.strip() for p in parts if isinstance(p, str) and p.strip()))


def parse_person(person: dict[str, Any]) -> ParsedPerson:
  metadata = person.get("metadata", {})
  base = ParsedPerson(resource_name=person["resourceName"], etag=person.get("etag"), deleted=bool(metadata.get("deleted")), raw=person)
  if base.deleted:
    return base

  name = _primary(person.get("names", [])) or {}
  organization = _primary(person.get("organizations", [])) or {}
  nickname = _primary(person.get("nicknames", [])) or {}
  birthday = (_primary(person.get("birthdays", [])) or {}).get("date") or {}
  photo = next((p.get("url") for p in person.get("photos", []) if p.get("url") and not p.get("default")), None)
  biography = _primary(person.get("biographies", [])) or {}

  methods: list[ParsedMethod] = []
  for kind, key, read in (
    (ContactMethodKind.phone, "phoneNumbers", lambda i: _text(i.get("value"))),
    (ContactMethodKind.email, "emailAddresses", lambda i: _text(i.get("value"))),
    (ContactMethodKind.address, "addresses", _address),
    (ContactMethodKind.url, "urls", lambda i: _text(i.get("value"))),
  ):
    for item in person.get(key, []):
      if value := read(item):
        methods.append(ParsedMethod(kind=kind, label=_label(item), value=value))

  given, family = _text(name.get("givenName")), _text(name.get("familyName"))
  display = (
    _text(name.get("displayName"))
    or " ".join(p for p in (given, family) if p)
    or _text(organization.get("name"))
    or next((m.value for m in methods if m.kind in (ContactMethodKind.email, ContactMethodKind.phone)), "")
  )
  month, day = birthday.get("month") or None, birthday.get("day") or None
  return ParsedPerson(
    resource_name=base.resource_name,
    etag=base.etag,
    deleted=False,
    raw=person,
    display_name=display,
    given_name=given,
    family_name=family,
    nickname=_text(nickname.get("value")),
    organization=_text(organization.get("name")),
    job_title=_text(organization.get("title")),
    birthday_month=month if month and day else None,
    birthday_day=day if month and day else None,
    # Google writes 0 for a birthday without a year.
    birthday_year=(birthday.get("year") or None) if month and day else None,
    photo_url=photo,
    notes=_text(biography.get("value")),
    methods=methods,
  )
