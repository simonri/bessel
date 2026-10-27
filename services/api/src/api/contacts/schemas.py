import base64
from datetime import date, datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import UUID4, Field, StringConstraints, field_validator, model_validator

from api.addresses.schemas import AddressParts
from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema
from api.contacts.person import primary
from api.contacts.phones import display_phone
from api.models.contact import Contact, ContactInteractionKind, ContactInteractionSource, ContactMethodKind


class ContactMethodSchema(Schema):
  label: str | None = Field(description="As the address book names it, e.g. 'Mobile' or 'Work'.")
  value: str
  display: str = Field(description="How to show the value: phone numbers spaced (\"070-123 45 67\"), anything else as saved.")


class ContactAddressSchema(ContactMethodSchema):
  latitude: float | None = Field(default=None, description="Where it is, known once the address was picked from Suggest Addresses.")
  longitude: float | None = Field(default=None)


class ContactSighting(Schema):
  on: date = Field(description="The day, in the user's timezone.")
  kind: ContactInteractionKind
  summary: str | None = Field(description="The calendar event's title, or the note logged with it.")


class ContactDate(Schema):
  label: str = Field(description="As the address book names it, e.g. 'Anniversary'.")
  month: int = Field(ge=1, le=12)
  day: int = Field(ge=1, le=31)
  year: int | None


class ContactBirthday(Schema):
  month: int = Field(ge=1, le=12)
  day: int = Field(ge=1, le=31)
  year: int | None = Field(description="Often unknown.")


# Not an IDSchema: its json_schema_mode_override trips a Pydantic bug when a model (ContactMethodSchema here)
# is referenced by more than one field, which broke the MCP tool's output schema.
class ContactSchema(TimestampedSchema):
  id: UUID4 = Field(description="The ID of the object.")
  source_id: UUID
  display_name: str
  name_prefix: str | None = Field(description="Before the name, e.g. 'Dr.'.")
  given_name: str | None
  middle_name: str | None
  family_name: str | None
  name_suffix: str | None = Field(description="After the name, e.g. 'Jr.'.")
  nickname: str | None
  organization: str | None
  job_title: str | None
  birthday: ContactBirthday | None
  photo_url: str | None
  notes: str | None = Field(description="The address book's own notes for the person.")
  external_url: str | None = Field(description="The person in Google Contacts, where they can be edited.")
  phones: list[ContactMethodSchema]
  emails: list[ContactMethodSchema]
  addresses: list[ContactAddressSchema]
  urls: list[ContactMethodSchema]
  dates: list[ContactDate] = Field(description="Other dates the address book keeps, such as anniversaries; birthdays are under birthday.")
  tags: list[str] = Field(description="Bessel's own, never sent to Google.")
  last_seen: ContactSighting | None = Field(
    default=None, description="The latest of what was logged with them and the past calendar events they were surely on, within a year."
  )

  @model_validator(mode="before")
  @classmethod
  def _from_contact(cls, data: Any) -> Any:
    if not isinstance(data, Contact):
      return data

    def of(kind: ContactMethodKind) -> list[dict[str, Any]]:
      return [
        {"label": m.label, "value": m.value, "display": display_phone(m.value) if kind == ContactMethodKind.phone else m.value}
        for m in data.methods
        if m.kind == kind
      ]

    name = primary(data.person.get("names", [])) or {}
    birthday = {"month": data.birthday_month, "day": data.birthday_day, "year": data.birthday_year} if data.birthday_month and data.birthday_day else None
    return {
      "id": data.id,
      "created_at": data.created_at,
      "modified_at": data.modified_at,
      "source_id": data.source_id,
      "display_name": data.display_name,
      "name_prefix": name.get("honorificPrefix") or None,
      "given_name": data.given_name,
      "middle_name": name.get("middleName") or None,
      "family_name": data.family_name,
      "name_suffix": name.get("honorificSuffix") or None,
      "nickname": data.nickname,
      "organization": data.organization,
      "job_title": data.job_title,
      "birthday": birthday,
      "photo_url": data.photo_url,
      "notes": data.notes,
      "external_url": google_contacts_url(data.resource_name),
      "phones": of(ContactMethodKind.phone),
      "emails": of(ContactMethodKind.email),
      "addresses": of(ContactMethodKind.address),
      "urls": of(ContactMethodKind.url),
      "dates": dates_of(data.person),
      "tags": data.tags,
    }


def dates_of(person: dict[str, Any]) -> list[dict[str, Any]]:
  """People API "events": [{"date": {...}, "type": "anniversary", "formattedType": "Anniversary"}]; a year of 0 means unknown."""
  dates = []
  for event in person.get("events", []):
    when = event.get("date") or {}
    if when.get("month") and when.get("day"):
      label = event.get("formattedType") or (event.get("type") or "").capitalize() or "Date"
      dates.append({"label": label, "month": when["month"], "day": when["day"], "year": when.get("year") or None})
  return dates


def google_contacts_url(resource_name: str) -> str | None:
  """people/c123 opens at contacts.google.com/person/c123."""
  person_id = resource_name.removeprefix("people/")
  return f"https://contacts.google.com/person/{person_id}" if person_id != resource_name else None


class ContactListResponse(ListResource[ContactSchema]):
  pass


class ContactSourceSchema(IDSchema):
  email: str = Field(description="The Google account the contacts come from.")
  synced_at: datetime | None
  sync_error: str | None
  can_edit: bool = Field(description="Google lets Bessel change these contacts; otherwise it can only read them.")


class ContactMethodInput(Schema):
  label: str | None = Field(default=None, max_length=100)
  value: str = Field(min_length=1, max_length=1000)
  address: AddressParts | None = Field(
    default=None, description="Addresses only: the parts from Get Address, saved as the address book's own fields, and where it is."
  )


class ContactUpdate(Schema):
  """Fields to change; any left out stay as they are, and null clears one."""

  name_prefix: str | None = Field(default=None, max_length=255)
  given_name: str | None = Field(default=None, max_length=255)
  middle_name: str | None = Field(default=None, max_length=255)
  family_name: str | None = Field(default=None, max_length=255)
  name_suffix: str | None = Field(default=None, max_length=255)
  nickname: str | None = Field(default=None, max_length=255)
  organization: str | None = Field(default=None, max_length=500)
  job_title: str | None = Field(default=None, max_length=500)
  birthday: ContactBirthday | None = None
  notes: str | None = Field(default=None, max_length=10000)
  phones: list[ContactMethodInput] | None = None
  emails: list[ContactMethodInput] | None = None
  addresses: list[ContactMethodInput] | None = None
  urls: list[ContactMethodInput] | None = None


MAX_PHOTO_BYTES = 2 * 1024 * 1024


class ContactPhotoUpdate(Schema):
  photo: str = Field(max_length=MAX_PHOTO_BYTES * 2, description="The new photo, a JPEG or PNG, base64-encoded (2 MB at most).")

  @field_validator("photo")
  @classmethod
  def _image(cls, photo: str) -> str:
    try:
      data = base64.b64decode(photo, validate=True)
    except ValueError as e:
      raise ValueError("The photo isn't valid base64") from e
    if not data.startswith((b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n")):
      raise ValueError("The photo must be a JPEG or PNG")
    if len(data) > MAX_PHOTO_BYTES:
      raise ValueError("The photo must be 2 MB or smaller")
    return photo

  def image_bytes(self) -> bytes:
    return base64.b64decode(self.photo)


class ContactCreate(ContactUpdate):
  source_id: UUID = Field(description="The address book to add the person to.")


class ContactAuthorizeResponse(Schema):
  url: str = Field(description="Google's page for allowing Bessel to edit this account's contacts.")


Tag = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class ContactTagsUpdate(Schema):
  """Bessel's own tags for a contact, never sent to Google."""

  tags: list[Tag] = Field(max_length=20, description="Replaces the tags.")

  @field_validator("tags")
  @classmethod
  def _distinct(cls, tags: list[str]) -> list[str]:
    seen: dict[str, str] = {}
    for tag in tags:
      seen.setdefault(tag.casefold(), tag)
    return list(seen.values())


class ContactReference(Schema):
  id: UUID
  display_name: str
  photo_url: str | None


class ContactInteractionSchema(Schema):
  id: UUID | None = Field(description="Null for a calendar event they were surely on, which isn't stored and can't be deleted.")
  occurred_on: date
  kind: ContactInteractionKind
  source: ContactInteractionSource
  note: str | None
  event_title: str | None


class ContactInteractionCreate(Schema):
  kind: ContactInteractionKind = ContactInteractionKind.met
  note: str | None = Field(default=None, max_length=2000)
  occurred_on: date | None = Field(default=None, description="Defaults to today in the user's timezone; can't be in the future.")
  calendar_event_id: UUID | None = Field(default=None, description="The calendar event it happened at; sets the day and the kind.")


class ContactEventDismiss(Schema):
  calendar_event_id: UUID


class ContactFollowUpEvent(Schema):
  id: UUID
  title: str
  on: date


class ContactFollowUp(Schema):
  kind: Literal["note", "confirm"] = Field(
    description="note: they were surely at an event that just ended, anything to note? confirm: they might have been, were they?"
  )
  contact: ContactReference
  event: ContactFollowUpEvent


class ContactDateReminder(Schema):
  contact: ContactReference
  label: str = Field(description="'Birthday', or the address book's name for the date.")
  on: date
  years: int | None = Field(description="The age they turn, or how many years it's been; null when the year isn't known.")


class ContactReminders(Schema):
  dates: list[ContactDateReminder] = Field(description="Birthdays and other dates coming up, soonest first.")


class MeetingBriefPerson(Schema):
  contact: ContactReference
  sure: bool = Field(description="False when they're only named by first name in the title and might be someone else.")
  last_seen: ContactSighting | None
  recent: list[ContactInteractionSchema] = Field(description="What was logged with them lately, newest first.")
  upcoming: ContactDateReminder | None = Field(description="A birthday or other date in the next two weeks.")


class MeetingBrief(Schema):
  event: ContactFollowUpEvent
  people: list[MeetingBriefPerson]
