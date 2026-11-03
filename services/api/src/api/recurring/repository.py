from collections.abc import Sequence
from uuid import UUID

from api.common.repository.base import RepositoryBase, RepositoryIDMixin, RepositoryUserMixin
from api.models.recurring_series import RecurringSeries


class RecurringSeriesRepository(RepositoryBase[RecurringSeries], RepositoryIDMixin[RecurringSeries, UUID], RepositoryUserMixin[RecurringSeries]):
  model = RecurringSeries

  async def list_for_user(self, user_id: UUID) -> Sequence[RecurringSeries]:
    return await super().list_for_user(user_id, order_by=RecurringSeries.created_at)
