from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import Select, delete, exists, func, or_, select
from sqlalchemy.dialects.postgresql import distinct_on, insert

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.common.utils import generate_uuid, utc_now
from api.contacts.person import ParsedPerson
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.contact import Contact, ContactEventDismissal, ContactInteraction, ContactMethod, ContactSource


class ContactSourceRepository(RepositoryBase[ContactSource], RepositoryIDMixin[ContactSource, UUID]):
  model = ContactSource

  async def ensure_for_user(self, user_id: UUID) -> Sequence[ContactSource]:
    """One source per Google account that may read contacts; returns the user's sources."""
    accounts = await self.session.execute(
      select(CalendarAccount.id)
      .where(
        CalendarAccount.user_id == user_id,
        CalendarAccount.provider == CalendarProvider.google,
        CalendarAccount.can_read_people.is_(True),
        CalendarAccount.deleted_at.is_(None),
      )
      .where(~exists().where(ContactSource.account_id == CalendarAccount.id))
    )
    for (account_id,) in accounts.all():
      self.session.add(ContactSource(user_id=user_id, account_id=account_id))
    await self.session.flush()
    return await self.list_for_user(user_id)

  async def list_for_user(self, user_id: UUID) -> Sequence[ContactSource]:
    statement = self.get_base_statement().where(ContactSource.user_id == user_id).order_by(ContactSource.created_at)
    return await self.get_all(statement)

  async def list_user_ids(self) -> Sequence[UUID]:
    """Everyone with a Google account that may read contacts."""
    statement = (
      select(CalendarAccount.user_id)
      .where(CalendarAccount.provider == CalendarProvider.google, CalendarAccount.can_read_people.is_(True), CalendarAccount.deleted_at.is_(None))
      .distinct()
    )
    return (await self.session.execute(statement)).scalars().all()

  async def account_for(self, source: ContactSource) -> CalendarAccount:
    return (await self.session.execute(select(CalendarAccount).where(CalendarAccount.id == source.account_id))).scalar_one()


class ContactRepository(RepositoryBase[Contact], RepositoryIDMixin[Contact, UUID]):
  model = Contact

  def get_filtered_statement(self, user_id: UUID, *, search: str | None = None) -> Select[tuple[Contact]]:
    statement = self.get_base_statement().where(Contact.user_id == user_id, Contact.deleted_at.is_(None))
    if search and (query := search.strip()):
      statement = statement.where(
        or_(
          Contact.display_name.icontains(query, autoescape=True),
          Contact.nickname.icontains(query, autoescape=True),
          Contact.organization.icontains(query, autoescape=True),
          func.array_to_string(Contact.tags, " ").icontains(query, autoescape=True),
          exists().where(ContactMethod.contact_id == Contact.id, ContactMethod.value.icontains(query, autoescape=True)),
        )
      )
    return statement.order_by(func.lower(Contact.display_name), Contact.id)

  async def list_for_user(self, user_id: UUID) -> Sequence[Contact]:
    return await self.get_all(self.get_filtered_statement(user_id))

  async def purge_deleted(self, before: datetime) -> int:
    """Removes contacts deleted from the address book before `before`, and with them everything Bessel kept on them."""
    return await self.execute_for_rowcount(delete(Contact).where(Contact.deleted_at.is_not(None), Contact.deleted_at < before))

  async def apply(self, source: ContactSource, people: Sequence[ParsedPerson], *, full: bool) -> int:
    """Saves what Google sent, by its id for each person, so Bessel's own notes
    on a contact survive any resync. On a full sync, anyone not sent is gone."""
    existing = {c.resource_name: c for c in (await self.session.execute(select(Contact).where(Contact.source_id == source.id))).scalars().all()}
    now = utc_now()
    seen: set[str] = set()
    for person in people:
      seen.add(person.resource_name)
      contact = existing.get(person.resource_name)
      if person.deleted:
        if contact is not None and contact.deleted_at is None:
          contact.deleted_at = now
        continue
      if contact is not None and person.etag is not None and person.etag == contact.replaced_etag:
        continue
      if contact is None:
        contact = Contact(user_id=source.user_id, source_id=source.id, resource_name=person.resource_name, person={}, methods=[])
        self.session.add(contact)
        existing[person.resource_name] = contact
      _copy(person, contact)
      contact.deleted_at = None
    if full:
      for resource_name, contact in existing.items():
        if resource_name not in seen and contact.deleted_at is None:
          contact.deleted_at = now
    await self.session.flush()
    return len(seen)

  async def save_edited(self, source: ContactSource, person: ParsedPerson, *, replaced_etag: str | None) -> Contact:
    """Stores the person as Google returned them from an edit."""
    await self.apply(source, [person], full=False)
    contact = (await self.session.execute(select(Contact).where(Contact.source_id == source.id, Contact.resource_name == person.resource_name))).scalar_one()
    contact.replaced_etag = replaced_etag
    await self.session.flush()
    return contact


def _copy(person: ParsedPerson, contact: Contact) -> None:
  contact.etag = person.etag
  contact.person = person.raw
  contact.display_name = person.display_name
  contact.given_name = person.given_name
  contact.family_name = person.family_name
  contact.nickname = person.nickname
  contact.organization = person.organization
  contact.job_title = person.job_title
  contact.birthday_month = person.birthday_month
  contact.birthday_day = person.birthday_day
  contact.birthday_year = person.birthday_year
  contact.photo_url = person.photo_url
  contact.notes = person.notes
  contact.methods = [ContactMethod(kind=m.kind, label=m.label, value=m.value, position=i) for i, m in enumerate(person.methods)]


class ContactInteractionRepository(RepositoryBase[ContactInteraction], RepositoryIDMixin[ContactInteraction, UUID]):
  model = ContactInteraction

  async def list_for_contact(self, contact: Contact, *, limit: int) -> Sequence[ContactInteraction]:
    statement = (
      self.get_base_statement()
      .where(ContactInteraction.contact_id == contact.id, ContactInteraction.deleted_at.is_(None))
      .order_by(ContactInteraction.occurred_on.desc(), ContactInteraction.created_at.desc())
      .limit(limit)
    )
    return await self.get_all(statement)

  async def latest_for_contacts(self, contact_ids: Sequence[UUID]) -> dict[UUID, ContactInteraction]:
    """Each contact's newest entry, in one query."""
    if not contact_ids:
      return {}
    statement = (
      self.get_base_statement()
      .where(ContactInteraction.contact_id.in_(contact_ids), ContactInteraction.deleted_at.is_(None))
      .ext(distinct_on(ContactInteraction.contact_id))
      .order_by(ContactInteraction.contact_id, ContactInteraction.occurred_on.desc(), ContactInteraction.created_at.desc())
    )
    return {i.contact_id: i for i in await self.get_all(statement)}

  async def logged_events(self, user_id: UUID) -> set[tuple[UUID, str]]:
    """(contact, event) pairs already logged from the calendar."""
    statement = select(ContactInteraction.contact_id, ContactInteraction.event_key).where(
      ContactInteraction.user_id == user_id, ContactInteraction.event_key.is_not(None), ContactInteraction.deleted_at.is_(None)
    )
    return {(contact_id, key) for contact_id, key in (await self.session.execute(statement)).all()}

  async def get_for_event(self, contact: Contact, event_key: str) -> ContactInteraction | None:
    statement = self.get_base_statement().where(
      ContactInteraction.contact_id == contact.id, ContactInteraction.event_key == event_key, ContactInteraction.deleted_at.is_(None)
    )
    return (await self.session.execute(statement)).scalars().first()

  async def get_for_contact(self, contact: Contact, interaction_id: UUID) -> ContactInteraction | None:
    statement = self.get_base_statement().where(
      ContactInteraction.id == interaction_id, ContactInteraction.contact_id == contact.id, ContactInteraction.deleted_at.is_(None)
    )
    return (await self.session.execute(statement)).scalars().first()

  async def remove(self, interaction: ContactInteraction) -> None:
    await self.session.delete(interaction)
    await self.session.flush()


class ContactEventDismissalRepository(RepositoryBase[ContactEventDismissal]):
  model = ContactEventDismissal

  async def keys_for_user(self, user_id: UUID) -> set[tuple[UUID, str]]:
    statement = (
      select(ContactEventDismissal.contact_id, ContactEventDismissal.event_key)
      .join(Contact, Contact.id == ContactEventDismissal.contact_id)
      .where(Contact.user_id == user_id)
    )
    return {(contact_id, key) for contact_id, key in (await self.session.execute(statement)).all()}

  async def dismiss(self, contact: Contact, event_key: str) -> None:
    statement = insert(ContactEventDismissal).values(id=generate_uuid(), created_at=utc_now(), contact_id=contact.id, event_key=event_key)
    await self.session.execute(statement.on_conflict_do_nothing(index_elements=["contact_id", "event_key"]))
