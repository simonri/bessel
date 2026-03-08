from datetime import date
from uuid import UUID

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.journal_entry import JournalEntry


class JournalEntryRepository(RepositoryBase[JournalEntry], RepositoryIDMixin[JournalEntry, UUID]):
  model = JournalEntry

  async def get_by_date(self, entry_date: date) -> JournalEntry | None:
    statement = self.get_base_statement().where(JournalEntry.entry_date == entry_date)
    return await self.get_one_or_none(statement)
