from collections.abc import Sequence
from uuid import UUID

from api.common.repository.base import RepositoryBase, RepositoryIDMixin, RepositoryUserMixin
from api.exceptions import ResourceNotFound
from api.models.category import Category
from api.models.category_rule import CategoryRule


class CategoryRepository(RepositoryBase[Category], RepositoryIDMixin[Category, UUID], RepositoryUserMixin[Category]):
  model = Category


class CategoryRuleRepository(RepositoryBase[CategoryRule], RepositoryIDMixin[CategoryRule, UUID]):
  model = CategoryRule

  async def list_for_user(self, user_id: UUID) -> Sequence[CategoryRule]:
    return await self.get_all(self.get_base_statement().where(CategoryRule.user_id == user_id).order_by(CategoryRule.pattern))

  async def get_owned(self, rule_id: UUID, user_id: UUID) -> CategoryRule:
    rule = await self.get_one_or_none(self.get_base_statement().where(CategoryRule.id == rule_id, CategoryRule.user_id == user_id))
    if rule is None:
      raise ResourceNotFound("Rule not found")
    return rule
