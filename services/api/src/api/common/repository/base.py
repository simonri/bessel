from collections.abc import Sequence
from datetime import datetime
from typing import Any, Protocol, Self
from uuid import UUID

from api.common.db.postgres import AsyncReadSession, AsyncSession
from api.exceptions import ResourceNotFound
from sqlalchemy import ColumnExpressionArgument, Select, func, over, select
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


class ModelUserProtocol(Protocol):
  user_id: Mapped[UUID | None]
  deleted_at: Mapped[datetime | None]


class ModelOwnedProtocol(ModelIDProtocol[UUID], ModelUserProtocol, Protocol):
  pass


class RepositoryIDMixin[MODEL_ID: ModelIDProtocol, ID_TYPE]:
  async def get_by_id(
    self: RepositoryProtocol[MODEL_ID],
    entity_id: ID_TYPE,
    *,
    options: Options = (),
  ) -> MODEL_ID | None:
    statement = self.get_base_statement().where(self.model.id == entity_id).options(*options)
    return await self.get_one_or_none(statement)

  async def get_owned_or_404[MODEL_OWNED: ModelOwnedProtocol](
    self: RepositoryProtocol[MODEL_OWNED],
    entity_id: UUID,
    user_id: UUID,
    *,
    check_not_deleted: bool = False,
    not_found_message: str = "Not found",
  ) -> MODEL_OWNED:
    statement = self.get_base_statement().where(self.model.id == entity_id).where(self.model.user_id == user_id)
    if check_not_deleted:
      statement = statement.where(self.model.deleted_at.is_(None))
    item = await self.get_one_or_none(statement)
    if item is None:
      raise ResourceNotFound(not_found_message)
    return item


class RepositoryUserMixin[MODEL_USER: ModelUserProtocol]:
  async def list_for_user(
    self: RepositoryProtocol[MODEL_USER],
    user_id: UUID,
    *,
    order_by: ColumnExpressionArgument[Any],
    extra_filters: Sequence[ColumnExpressionArgument[bool]] = (),
    limit: int | None = None,
  ) -> Sequence[MODEL_USER]:
    statement = self.get_base_statement().where(self.model.deleted_at.is_(None)).where(self.model.user_id == user_id).order_by(order_by)
    for extra_filter in extra_filters:
      statement = statement.where(extra_filter)
    if limit is not None:
      statement = statement.limit(limit)
    return await self.get_all(statement)
