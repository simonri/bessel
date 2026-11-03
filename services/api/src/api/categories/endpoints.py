from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from api.categories.repository import CategoryRepository, CategoryRuleRepository
from api.categories.schemas import (
  CategoryCreate,
  CategoryListResponse,
  CategoryRuleCreate,
  CategoryRuleCreated,
  CategoryRuleListResponse,
  CategoryRulePreview,
  CategoryRulePreviewRequest,
  CategoryRuleSchema,
  CategoryRuleUpdate,
  CategorySchema,
  CategoryUpdate,
)
from api.categories.service import category_service
from api.common.pagination import PaginationParamsQuery
from api.models.category import Category
from api.models.category_rule import CategoryRule
from api.postgres import DBSession
from api.transactions.repository import TransactionRepository
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get(
  "",
  summary="List Categories",
  response_model=CategoryListResponse,
)
async def list_categories(
  session: DBSession,
  current_user: CurrentDBUser,
  pagination: PaginationParamsQuery,
) -> CategoryListResponse:
  """List all categories."""
  repo = CategoryRepository.from_session(session)
  statement = repo.get_base_statement().where(Category.user_id == current_user.id).order_by(Category.name.asc())

  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  transaction_counts = await TransactionRepository.from_session(session).count_by_category(current_user.id)
  rule_counts = await CategoryRuleRepository.from_session(session).count_by_category(current_user.id)
  return CategoryListResponse.from_paginated_results(
    [_category_schema(item, transaction_counts, rule_counts) for item in items],
    total_count,
    pagination,
  )


@router.post("", summary="Create Category", response_model=CategorySchema, status_code=201)
async def create_category(body: CategoryCreate, session: DBSession, current_user: CurrentDBUser) -> CategorySchema:
  """A new category in a group, or a new group when it has no parent."""
  return CategorySchema.model_validate(await category_service.create_category(session, current_user.id, body))


@router.get("/rules", summary="List Category Rules", response_model=CategoryRuleListResponse)
async def list_category_rules(session: DBSession, current_user: CurrentDBUser) -> CategoryRuleListResponse:
  rules = await CategoryRuleRepository.from_session(session).list_for_user(current_user.id)
  counts = await TransactionRepository.from_session(session).count_by_rule(current_user.id)
  return CategoryRuleListResponse(items=[_rule_schema(rule, counts) for rule in rules])


@router.post("/rules", summary="Create Category Rule", response_model=CategoryRuleCreated, status_code=201)
async def create_category_rule(body: CategoryRuleCreate, session: DBSession, current_user: CurrentDBUser) -> CategoryRuleCreated:
  """Sorts future imports whose description contains the text into the category, and by default the ones already here."""
  rule, categorized = await category_service.create_rule(session, current_user.id, body)
  counts = await TransactionRepository.from_session(session).count_by_rule(current_user.id)
  return CategoryRuleCreated(**_rule_schema(rule, counts).model_dump(), categorized=categorized)


@router.post("/rules/preview", summary="Preview Category Rule", response_model=CategoryRulePreview)
async def preview_category_rule(body: CategoryRulePreviewRequest, session: DBSession, current_user: CurrentDBUser) -> CategoryRulePreview:
  """The existing transactions a rule with these settings matches, and which of them it would sort. Changes nothing."""
  return await category_service.preview_rule(session, current_user.id, body)


@router.patch("/rules/{rule_id}", summary="Update Category Rule", response_model=CategoryRuleCreated)
async def update_category_rule(rule_id: UUID, body: CategoryRuleUpdate, session: DBSession, current_user: CurrentDBUser) -> CategoryRuleCreated:
  """Transactions the rule sorted follow its new settings; a category the user chose is never touched."""
  rule = await CategoryRuleRepository.from_session(session).get_owned(rule_id, current_user.id)
  rule, categorized = await category_service.update_rule(session, rule, body)
  counts = await TransactionRepository.from_session(session).count_by_rule(current_user.id)
  return CategoryRuleCreated(**_rule_schema(rule, counts).model_dump(), categorized=categorized)


@router.delete("/rules/{rule_id}", summary="Delete Category Rule", status_code=204)
async def delete_category_rule(
  rule_id: UUID,
  session: DBSession,
  current_user: CurrentDBUser,
  release: Annotated[bool, Query(description="Also take back the category it gave, so other rules or the user sort those again.")] = False,
) -> None:
  """Stops sorting new imports by it; by default transactions it already sorted keep their category."""
  rule = await CategoryRuleRepository.from_session(session).get_owned(rule_id, current_user.id)
  await category_service.delete_rule(session, rule, release=release)


@router.patch("/{category_id}", summary="Update Category", response_model=CategorySchema)
async def update_category(category_id: UUID, body: CategoryUpdate, session: DBSession, current_user: CurrentDBUser) -> CategorySchema:
  category = await CategoryRepository.from_session(session).get_owned_or_404(category_id, current_user.id, not_found_message="Category not found")
  category = await category_service.update_category(session, category, body)
  transaction_counts = await TransactionRepository.from_session(session).count_by_category(current_user.id)
  rule_counts = await CategoryRuleRepository.from_session(session).count_by_category(current_user.id)
  return _category_schema(category, transaction_counts, rule_counts)


@router.delete("/{category_id}", summary="Delete Category", status_code=204)
async def delete_category(
  category_id: UUID,
  session: DBSession,
  current_user: CurrentDBUser,
  move_to: Annotated[UUID | None, Query(description="Category its transactions and rules move to.")] = None,
  leave_uncategorized: Annotated[bool, Query(description="Leave its transactions uncategorized and delete its rules.")] = False,
) -> None:
  """Refused while it holds transactions or rules, unless told where they go; a group must be empty first."""
  category = await CategoryRepository.from_session(session).get_owned_or_404(category_id, current_user.id, not_found_message="Category not found")
  await category_service.delete_category(session, category, move_to=move_to, leave_uncategorized=leave_uncategorized)


def _category_schema(category: Category, transaction_counts: dict[UUID, int], rule_counts: dict[UUID, int]) -> CategorySchema:
  counts = {"transaction_count": transaction_counts.get(category.id, 0), "rule_count": rule_counts.get(category.id, 0)}
  return CategorySchema.model_validate(category).model_copy(update=counts)


def _rule_schema(rule: CategoryRule, counts: dict[UUID, int]) -> CategoryRuleSchema:
  return CategoryRuleSchema.model_validate(rule).model_copy(update={"transaction_count": counts.get(rule.id, 0)})
