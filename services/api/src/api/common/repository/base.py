from collections.abc import Sequence
from typing import Any, Protocol, Self

from api.common.db.postgres import AsyncReadSession, AsyncSession
from sqlalchemy import Select, func, over, select
from sqlalchemy.orm import Mapped
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.sql.base import ExecutableOption

type Options = Sequence[ExecutableOption]


class RepositoryProtocol[M](Protocol):
  model: type[M]

  async def get_one(self, statement: Select[tuple[M]]) -> M: ...

  async def get_one_or_none(self, statement: Select[tuple[M]]) -> M | None: ...

  async def get_all(self, statement: Select[tuple[M]]) -> Sequence[M]: ...

  async def paginate(self, statement: Select[tuple[M]], *, limit: int, page: int) -> tuple[list[M], int]: ...

  def get_base_statement(self) -> Select[tuple[M]]: ...

  async def create(self, item: M, *, flush: bool = False) -> M: ...

  async def update(
    self,
    item: M,
    *,
    update_dict: dict[str, Any] | None = None,
    flush: bool = False,
  ) -> M: ...


class RepositoryBase[M]:
  model: type[M]

  def __init__(self, session: AsyncSession | AsyncReadSession) -> None:
    self.session = session

  async def get_one(self, statement: Select[tuple[M]]) -> M:
    result = await self.session.execute(statement)
    return result.unique().scalar_one()

  async def get_one_or_none(self, statement: Select[tuple[M]]) -> M | None:
    result = await self.session.execute(statement)
    return result.unique().scalar_one_or_none()

  async def get_all(self, statement: Select[tuple[M]]) -> Sequence[M]:
    result = await self.session.execute(statement)
    return result.scalars().unique().all()

  @classmethod
  def from_session(cls, session: AsyncSession | AsyncReadSession) -> Self:
    return cls(session)

  def get_base_statement(self) -> Select[tuple[M]]:
    return select(self.model)

  async def paginate(self, statement: Select[tuple[M]], *, limit: int, page: int) -> tuple[list[M], int]:
    offset = (page - 1) * limit
    paginated_statement: Select[tuple[M, int]] = statement.add_columns(over(func.count())).limit(limit).offset(offset)

    results = await self.session.execute(paginated_statement)

    items: list[M] = []
    count = 0
    for result in results.unique().all():
      item, count = result._tuple()
      items.append(item)

    return items, count

  async def create(self, item: M, *, flush: bool = False) -> M:
    self.session.add(item)
    if flush:
      await self.session.flush()
    return item

  async def delete(self, item: M, *, flush: bool = False) -> None:
    await self.session.delete(item)
    if flush:
      await self.session.flush()

  async def update(
    self,
    item: M,
    *,
    update_dict: dict[str, Any] | None = None,
    flush: bool = False,
  ) -> M:
    if update_dict is not None:
      for attr, value in update_dict.items():
        setattr(item, attr, value)
        # Always consider that the attribute was modified if it's explictly set
        # in the update_dict. This forces SQLAlchemy to include it in the
        # UPDATE statement, even if the value is the same as before.
        # Ref: https://docs.sqlalchemy.org/en/20/orm/session_api.html#sqlalchemy.orm.attributes.flag_modified
        try:
          flag_modified(item, attr)
        # Don't fail if the attribute is not tracked by SQLAlchemy
        except KeyError:
          pass

    self.session.add(item)

    if flush:
      await self.session.flush()

    return item


class ModelIDProtocol[ID_TYPE](Protocol):
  id: Mapped[ID_TYPE]


class RepositoryIDMixin[MODEL_ID: ModelIDProtocol, ID_TYPE]:
  async def get_by_id(
    self: RepositoryProtocol[MODEL_ID],
    entity_id: ID_TYPE,
    *,
    options: Options = (),
  ) -> MODEL_ID | None:
    statement = self.get_base_statement().where(self.model.id == entity_id).options(*options)
    return await self.get_one_or_none(statement)
