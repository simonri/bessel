from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import UUID4, Field, model_validator

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema
from api.models.contact import Contact, ContactMethodKind


class ContactMethodSchema(Schema):
  label: str | None = Field(description="As the address book names it, e.g. 'Mobile' or 'Work'.")
  value: str


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
