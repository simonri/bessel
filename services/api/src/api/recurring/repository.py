from collections.abc import Sequence
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from api.common.repository.base import RepositoryBase, RepositoryIDMixin, RepositoryUserMixin
from api.common.utils import generate_uuid, utc_now
from api.models.recurring_series import RecurringSeries


class RecurringSeriesRepository(RepositoryBase[RecurringSeries], RepositoryIDMixin[RecurringSeries, UUID], RepositoryUserMixin[RecurringSeries]):
  model = RecurringSeries

  async def list_for_user(self, user_id: UUID) -> Sequence[RecurringSeries]:
    return await super().list_for_user(user_id, order_by=RecurringSeries.created_at)

  async def upsert(self, user_id: UUID, *, key: str, typical_amount: int, changes: dict[str, Any]) -> RecurringSeries:
    """The review of this series with `changes` made: a new one, or the one already there when two actions race."""
    now = utc_now()
    statement = (
      pg_insert(RecurringSeries)
      .values(id=generate_uuid(), created_at=now, user_id=user_id, key=key, typical_amount=typical_amount, **changes)
      .on_conflict_do_update(index_elements=["user_id", "key", "typical_amount"], set_={**changes, "modified_at": now})
      .returning(RecurringSeries.id)
    )
    review_id = (await self.session.execute(statement)).scalar_one()
    return (await self.session.execute(select(RecurringSeries).where(RecurringSeries.id == review_id).execution_options(populate_existing=True))).scalar_one()
