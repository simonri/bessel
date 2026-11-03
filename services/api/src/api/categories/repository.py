from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import exists, func, select, update

from api.common.repository.base import RepositoryBase, RepositoryIDMixin, RepositoryUserMixin
from api.exceptions import ResourceNotFound
from api.models.category import Category
from api.models.category_rule import CategoryRule


class CategoryRepository(RepositoryBase[Category], RepositoryIDMixin[Category, UUID], RepositoryUserMixin[Category]):
  model = Category

  async def has_children(self, category: Category) -> bool:
    # Soft-deleted children too: deleting the parent cascades to every row, taking their transactions' category with them.
    statement = select(exists().where(Category.parent_id == category.id))
    return bool((await self.session.execute(statement)).scalar())


class CategoryRuleRepository(RepositoryBase[CategoryRule], RepositoryIDMixin[CategoryRule, UUID]):
  model = CategoryRule

  async def list_for_user(self, user_id: UUID) -> Sequence[CategoryRule]:
    return await self.get_all(self.get_base_statement().where(CategoryRule.user_id == user_id).order_by(CategoryRule.pattern))

  async def get_owned(self, rule_id: UUID, user_id: UUID) -> CategoryRule:
    rule = await self.get_one_or_none(self.get_base_statement().where(CategoryRule.id == rule_id, CategoryRule.user_id == user_id))
    if rule is None:
      raise ResourceNotFound("Rule not found")
    return rule

  async def count_by_category(self, user_id: UUID) -> dict[UUID, int]:
    statement = select(CategoryRule.category_id, func.count()).where(CategoryRule.user_id == user_id).group_by(CategoryRule.category_id)
    return dict((await self.session.execute(statement)).all())

  async def retarget(self, user_id: UUID, source_id: UUID, target_id: UUID) -> int:
    statement = update(CategoryRule).where(CategoryRule.user_id == user_id, CategoryRule.category_id == source_id).values(category_id=target_id)
    return await self.execute_for_rowcount(statement)
