from collections.abc import Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from api.common.repository.base import RepositoryBase
from api.models.tree_of_alpha_news import TreeOfAlphaNews


class TreeOfAlphaNewsRepository(RepositoryBase[TreeOfAlphaNews]):
  model = TreeOfAlphaNews

  async def upsert_all(self, rows: list[dict[str, Any]]) -> None:
    statement = pg_insert(TreeOfAlphaNews).values(rows)
    statement = statement.on_conflict_do_update(
      index_elements=["external_id"],
      set_={"likes": statement.excluded.likes},
    )
    await self.session.execute(statement)

  async def list_pending_notification(self, *, min_likes: int) -> Sequence[TreeOfAlphaNews]:
    statement = (
      select(TreeOfAlphaNews)
      .where(TreeOfAlphaNews.likes >= min_likes)
      .where(TreeOfAlphaNews.notification_sent_at.is_(None))
      .where(TreeOfAlphaNews.deleted_at.is_(None))
    )
    return await self.get_all(statement)
