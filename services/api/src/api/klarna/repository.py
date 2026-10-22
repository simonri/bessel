from collections.abc import Sequence
from uuid import UUID

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.klarna import KlarnaPayLater


class KlarnaPayLaterRepository(RepositoryBase[KlarnaPayLater], RepositoryIDMixin[KlarnaPayLater, UUID]):
  model = KlarnaPayLater

  async def get_for_account(self, bank_account_id: UUID) -> KlarnaPayLater | None:
    return await self.get_one_or_none(self.get_base_statement().where(KlarnaPayLater.bank_account_id == bank_account_id))

  async def list_all(self) -> Sequence[KlarnaPayLater]:
    return await self.get_all(self.get_base_statement())
