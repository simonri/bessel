import re
import unicodedata
from uuid import UUID, uuid4

from api.categories.repository import CategoryRepository, CategoryRuleRepository
from api.categories.rules import best_rule, categorize, fits
from api.categories.schemas import (
  CategoryCreate,
  CategoryRuleCreate,
  CategoryRuleMatch,
  CategoryRulePreview,
  CategoryRulePreviewRequest,
  CategoryRuleUpdate,
  CategoryUpdate,
)
from api.common.repository.base import without_required_nulls
from api.exceptions import ConflictError, ValidationError
from api.models.category import Category
from api.models.category_rule import CategoryRule
from api.postgres import AsyncSession
from api.transactions.repository import TransactionRepository

PREVIEW_LIMIT = 50


def slugify(name: str) -> str:
  ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
  return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-") or "category"


def _plural(count: int, word: str) -> str:
  return f"{count} {word}{'' if count == 1 else 's'}"


class CategoryService:
  async def create_category(self, session: AsyncSession, user_id: UUID, body: CategoryCreate) -> Category:
    group = await self._group(session, body.parent_id, user_id) if body.parent_id else None
    excluded = body.excluded if body.excluded is not None else group is not None and group.excluded
    category = Category(
      name=body.name,
      slug=slugify(body.name),
      color=body.color,
      excluded=excluded,
      income=body.income,
      parent_id=group.id if group else None,
      user_id=user_id,
    )
    return await CategoryRepository.from_session(session).create(category, flush=True)

  async def update_category(self, session: AsyncSession, category: Category, body: CategoryUpdate) -> Category:
    changes = body.model_dump(exclude_unset=True)
    if "parent_id" in changes:
      parent_id = changes.pop("parent_id")
      # Groups stay groups and categories stay in one, so the tree keeps its two levels.
      if category.parent_id is None and parent_id is not None:
        raise ValidationError("A group can't go in another group")
      if category.parent_id is not None:
        if parent_id is None:
          raise ValidationError("A category stays in a group")
        changes["parent_id"] = (await self._group(session, parent_id, category.user_id)).id
    changes = without_required_nulls(Category, changes)
    if "name" in changes:
      changes["slug"] = slugify(changes["name"])
    return await CategoryRepository.from_session(session).update(category, update_dict=changes, flush=True)

  async def delete_category(self, session: AsyncSession, category: Category, *, move_to: UUID | None, leave_uncategorized: bool) -> None:
    """Deletes it once its transactions and rules have somewhere to go: another category, or uncategorized when asked."""
    categories = CategoryRepository.from_session(session)
    rules = CategoryRuleRepository.from_session(session)
    transactions = TransactionRepository.from_session(session)
    user_id = category.user_id
    if await categories.has_children(category):
      raise ConflictError("Move or delete the categories in this group first")
    if move_to is not None and leave_uncategorized:
      raise ValidationError("Either move its transactions or leave them uncategorized, not both")

    if move_to is not None:
      target = await categories.get_owned_or_404(move_to, user_id, not_found_message="Category not found")
      if target.id == category.id or target.parent_id is None:
        raise ValidationError("Move them to another category, not a group")
      await transactions.move_category(user_id, category.id, target.id)
      await rules.retarget(user_id, category.id, target.id)
    elif leave_uncategorized:
      await transactions.clear_category(user_id, category.id)
      await rules.delete_for_category(user_id, category.id)
    else:
      transaction_count = (await transactions.count_by_category(user_id)).get(category.id, 0)
      rule_count = (await rules.count_by_category(user_id)).get(category.id, 0)
      if transaction_count or rule_count:
        held = f"{_plural(transaction_count, 'transaction')} and {_plural(rule_count, 'rule')}"
        raise ConflictError(f"{held} use it: choose a category to move them to, or leave them uncategorized")
    await categories.delete(category, flush=True)

  async def create_rule(self, session: AsyncSession, user_id: UUID, body: CategoryRuleCreate) -> tuple[CategoryRule, int]:
    """The new rule and how many existing transactions it sorted."""
    await CategoryRepository.from_session(session).get_owned_or_404(body.category_id, user_id, not_found_message="Category not found")
    rule = CategoryRule(**body.model_dump(exclude={"apply_now"}), user_id=user_id)
    rule = await CategoryRuleRepository.from_session(session).create(rule, flush=True)
    categorized = await categorize(session, user_id, only_rule=rule) if body.apply_now else 0
    return rule, categorized

  async def update_rule(self, session: AsyncSession, rule: CategoryRule, body: CategoryRuleUpdate) -> tuple[CategoryRule, int]:
    """What the rule sorted is sorted again under its new settings, which may hand some to another rule or back
    to the user to sort. Returns the rule and how many uncategorized ones `apply_now` sorted."""
    changes = without_required_nulls(CategoryRule, body.model_dump(exclude_unset=True, exclude={"apply_now"}))
    if "category_id" in changes:
      await CategoryRepository.from_session(session).get_owned_or_404(changes["category_id"], rule.user_id, not_found_message="Category not found")
    rule = await CategoryRuleRepository.from_session(session).update(rule, update_dict=changes, flush=True)
    released = await TransactionRepository.from_session(session).release_from_rule(rule.user_id, rule.id)
    if released:
      await categorize(session, rule.user_id, transaction_ids=released)
    categorized = await categorize(session, rule.user_id, only_rule=rule) if body.apply_now else 0
    return rule, categorized

  async def delete_rule(self, session: AsyncSession, rule: CategoryRule, *, release: bool) -> None:
    """Without `release`, what it sorted keeps the category, now as if the user chose it; with it, those are sorted
    again by the other rules or wait for the user."""
    user_id = rule.user_id
    released = await TransactionRepository.from_session(session).release_from_rule(user_id, rule.id) if release else []
    await CategoryRuleRepository.from_session(session).delete(rule, flush=True)
    if released:
      await categorize(session, user_id, transaction_ids=released)

  async def preview_rule(self, session: AsyncSession, user_id: UUID, body: CategoryRulePreviewRequest) -> CategoryRulePreview:
    """What a rule with these settings would match among the transactions already here, by the same matching and
    precedence imports use."""
    rules = CategoryRuleRepository.from_session(session)
    editing = await rules.get_owned(body.rule_id, user_id) if body.rule_id else None
    draft = CategoryRule(id=editing.id if editing else uuid4(), pattern=body.pattern, scope=body.scope, direction=body.direction)
    competing = [rule for rule in await rules.list_for_user(user_id) if rule.id != draft.id] + [draft]

    matches: list[CategoryRuleMatch] = []
    sortable = 0
    for row in await TransactionRepository.from_session(session).rule_matches(user_id, contains=body.pattern):
      if not fits(draft, row):
        continue
      # The ones the edited rule sorted are sorted again when it's saved.
      open_to_it = row.category_id is None or (editing is not None and row.category_rule_id == editing.id)
      would_sort = open_to_it and best_rule(competing, row) is draft
      if would_sort and row.category_id is None:
        sortable += 1
      matches.append(
        CategoryRuleMatch(
          id=row.id,
          transaction_date=row.transaction_date,
          description=row.description,
          name=row.name,
          amount=row.amount,
          currency=row.currency,
          direction=row.direction,
          category_id=row.category_id,
          by_rule=row.category_rule_id is not None,
          would_sort=would_sort,
        )
      )
    return CategoryRulePreview(match_count=len(matches), sortable_count=sortable, items=matches[:PREVIEW_LIMIT])

  async def _group(self, session: AsyncSession, group_id: UUID, user_id: UUID) -> Category:
    group = await CategoryRepository.from_session(session).get_owned_or_404(group_id, user_id, not_found_message="Group not found")
    if group.parent_id is not None:
      raise ValidationError("Categories go in a group, one level deep")
    return group


category_service = CategoryService()
