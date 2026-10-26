"""Turning Bessel's changes to a contact into a People API update.

Google replaces each field named in the update mask whole, so a changed field
is rebuilt from the person as Google last sent it: entries the user kept (a
second number, its label, Google's metadata) go back exactly as they came, and
fields the user didn't touch aren't sent at all.
"""

import copy
from typing import Any

from api.contacts.person import address_text, label_of, primary
from api.contacts.phones import compact_phone

# Bessel's field -> the People API field it lives in.
_PERSON_FIELD = {
  "name_prefix": "names",
  "given_name": "names",
  "middle_name": "names",
  "family_name": "names",
  "name_suffix": "names",
  "nickname": "nicknames",
  "organization": "organizations",
  "job_title": "organizations",
  "birthday": "birthdays",
  "notes": "biographies",
  "phones": "phoneNumbers",
  "emails": "emailAddresses",
  "addresses": "addresses",
  "urls": "urls",
}
# The key each list entry keeps its value under.
_VALUE_KEY = {"phoneNumbers": "value", "emailAddresses": "value", "urls": "value", "addresses": "formattedValue"}
# Bessel's name parts -> the People API's.
_NAME_PARTS = (
  ("name_prefix", "honorificPrefix"),
  ("given_name", "givenName"),
  ("middle_name", "middleName"),
  ("family_name", "familyName"),
  ("name_suffix", "honorificSuffix"),
)


def _value_of(field: str, entry: dict[str, Any]) -> str | None:
  value = entry.get(_VALUE_KEY[field])
  if field == "addresses" and not value:
    return address_text(entry)
  if not isinstance(value, str):
    return None
  return compact_phone(value) if field == "phoneNumbers" else value.strip()


def _methods(field: str, existing: list[dict[str, Any]], wanted: list[dict[str, Any]]) -> list[dict[str, Any]]:
  unused = list(existing)
  result = []
  for item in wanted:
    value, label = item["value"].strip(), item.get("label") or None
    if field == "phoneNumbers":
      value = compact_phone(value)
    match = next((e for e in unused if _value_of(field, e) == value), None)
    if match is not None:
      unused.remove(match)
      entry = copy.deepcopy(match)
      if field == "phoneNumbers":
        # Saved spaced before: the same number, now without the spacing.
        entry["value"] = value
      if label != label_of(entry):
        entry.pop("formattedType", None)
        if label:
          entry["type"] = label
        else:
          entry.pop("type", None)
    else:
      entry = {_VALUE_KEY[field]: value, **({"type": label} if label else {})}
    result.append(entry)
  return result


def build_update(person: dict[str, Any], changes: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
  """The person to send and the fields to replace, from `changes` (Bessel field -> new value) applied to `person`."""
  fields = sorted({_PERSON_FIELD[key] for key in changes})
  body: dict[str, Any] = {}
  for field in fields:
    body[field] = _field(field, person, changes)
  if "resourceName" in person:
    body["resourceName"] = person["resourceName"]
    body["etag"] = person.get("etag")
  return body, fields


def _field(field: str, person: dict[str, Any], changes: dict[str, Any]) -> list[dict[str, Any]]:
  current = person.get(field, [])
  if field == "names":
    name = copy.deepcopy(primary(current) or {})
    for key, api_key in _NAME_PARTS:
      if key in changes:
        name[api_key] = changes[key] or None
    # Output-only, or derived from the parts just changed.
    for derived in ("displayName", "displayNameLastFirst", "unstructuredName", "metadata"):
      name.pop(derived, None)
    name = {k: v for k, v in name.items() if v}
    return [name] if any(name.get(api_key) for _, api_key in _NAME_PARTS) else []
  if field == "organizations":
    organization = copy.deepcopy(primary(current) or {})
    for key, api_key in (("organization", "name"), ("job_title", "title")):
      if key in changes:
        organization[api_key] = changes[key] or None
    organization = {k: v for k, v in organization.items() if v}
    return [organization] if organization.get("name") or organization.get("title") else []
  if field == "nicknames":
    return [{"value": changes["nickname"]}] if changes["nickname"] else []
  if field == "biographies":
    return [{"value": changes["notes"], "contentType": "TEXT_PLAIN"}] if changes["notes"] else []
  if field == "birthdays":
    birthday = changes["birthday"]
    if not birthday:
      return []
    date = {"month": birthday["month"], "day": birthday["day"], **({"year": birthday["year"]} if birthday.get("year") else {})}
    return [{"date": date}]
  key = next(k for k, f in _PERSON_FIELD.items() if f == field)
  return _methods(field, current, changes[key])
