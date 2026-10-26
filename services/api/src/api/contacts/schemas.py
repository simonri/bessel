from datetime import date, datetime
from typing import Annotated, Any
from uuid import UUID

from pydantic import UUID4, Field, StringConstraints, field_validator, model_validator

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema
from api.models.contact import Contact, ContactMethodKind


class ContactMethodSchema(Schema):
  label: str | None = Field(description="As the address book names it, e.g. 'Mobile' or 'Work'.")
  value: str


class ContactSighting(Schema):
  on: date = Field(description="The day, in the user's timezone.")
  event_title: str | None = Field(description="The calendar event they were on or named in; null when the user marked it themselves.")


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
  given_name: str | None
  family_name: str | None
  nickname: str | None
  organization: str | None
  job_title: str | None
  birthday: ContactBirthday | None
  photo_url: str | None
  notes: str | None = Field(description="The address book's own notes for the person.")
  external_url: str | None = Field(description="The person in Google Contacts, where they can be edited.")
  phones: list[ContactMethodSchema]
  emails: list[ContactMethodSchema]
  addresses: list[ContactMethodSchema]
  urls: list[ContactMethodSchema]
  tags: list[str] = Field(description="Bessel's own, never sent to Google.")
  keep_in_touch_days: int | None = Field(description="How often the user wants to be in touch, in days; null when they haven't said.")
  caught_up_on: date | None = Field(description="The last day the user marked as having been in touch.")
  last_seen: ContactSighting | None = Field(
    default=None, description="The later of caught_up_on and the last past calendar event they were on or named in, within a year."
  )
  catch_up_on: date | None = Field(default=None, description="When keeping in touch says to be in touch next; null without keep_in_touch_days.")

  @model_validator(mode="before")
  @classmethod
  def _from_contact(cls, data: Any) -> Any:
    if not isinstance(data, Contact):
      return data

    def of(kind: ContactMethodKind) -> list[dict[str, Any]]:
      return [{"label": m.label, "value": m.value} for m in data.methods if m.kind == kind]

    birthday = {"month": data.birthday_month, "day": data.birthday_day, "year": data.birthday_year} if data.birthday_month and data.birthday_day else None
    return {
      "id": data.id,
      "created_at": data.created_at,
      "modified_at": data.modified_at,
      "source_id": data.source_id,
      "display_name": data.display_name,
      "given_name": data.given_name,
      "family_name": data.family_name,
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
      "tags": data.tags,
      "keep_in_touch_days": data.keep_in_touch_days,
      "caught_up_on": data.caught_up_on,
    }


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


class ContactUpdate(Schema):
  """Fields to change; any left out stay as they are, and null clears one."""

  given_name: str | None = Field(default=None, max_length=255)
  family_name: str | None = Field(default=None, max_length=255)
  nickname: str | None = Field(default=None, max_length=255)
  organization: str | None = Field(default=None, max_length=500)
  job_title: str | None = Field(default=None, max_length=500)
  birthday: ContactBirthday | None = None
  notes: str | None = Field(default=None, max_length=10000)
  phones: list[ContactMethodInput] | None = None
  emails: list[ContactMethodInput] | None = None
  addresses: list[ContactMethodInput] | None = None
  urls: list[ContactMethodInput] | None = None


class ContactCreate(ContactUpdate):
  source_id: UUID = Field(description="The address book to add the person to.")


class ContactAuthorizeResponse(Schema):
  url: str = Field(description="Google's page for allowing Bessel to edit this account's contacts.")


Tag = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class ContactKeepUpUpdate(Schema):
  """Bessel's own fields on a contact, which stay in Bessel; any left out stay as they are."""

  tags: list[Tag] | None = Field(default=None, max_length=20, description="Replaces the tags; null clears them.")
  keep_in_touch_days: int | None = Field(default=None, ge=1, le=3650, description="Null stops the reminders.")
  caught_up_on: date | None = None

  @field_validator("tags")
  @classmethod
  def _distinct(cls, tags: list[str] | None) -> list[str]:
    seen: dict[str, str] = {}
    for tag in tags or []:
      seen.setdefault(tag.casefold(), tag)
    return list(seen.values())


class ContactReference(Schema):
  id: UUID
  display_name: str
  photo_url: str | None


class BirthdayReminder(Schema):
  contact: ContactReference
  on: date
  turns: int | None = Field(description="The age they turn; null when the birth year isn't known.")


class CatchUpReminder(Schema):
  contact: ContactReference
  due_on: date = Field(description="When it became time to be in touch; today when they've never been seen.")
  last_seen: ContactSighting | None


class ContactReminders(Schema):
  birthdays: list[BirthdayReminder] = Field(description="Soonest first.")
  catch_up: list[CatchUpReminder] = Field(description="People it's time to be in touch with, longest overdue first.")
