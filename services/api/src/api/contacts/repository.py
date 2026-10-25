from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import Select, exists, func, or_, select

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.common.utils import utc_now
from api.contacts.person import ParsedPerson
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.contact import Contact, ContactMethod, ContactSource


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
          exists().where(ContactMethod.contact_id == Contact.id, ContactMethod.value.icontains(query, autoescape=True)),
        )
      )
    return statement.order_by(func.lower(Contact.display_name), Contact.id)

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
