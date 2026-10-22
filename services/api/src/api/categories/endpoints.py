from uuid import UUID

from fastapi import APIRouter

from api.categories.repository import CategoryRepository, CategoryRuleRepository
from api.categories.rules import categorize
from api.categories.schemas import CategoryListResponse, CategoryRuleCreate, CategoryRuleCreated, CategoryRuleListResponse, CategoryRuleSchema, CategorySchema
from api.common.pagination import PaginationParamsQuery
from api.models.category import Category
from api.models.category_rule import CategoryRule
from api.postgres import DBSession
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
  return CategoryListResponse.from_paginated_results(
    [CategorySchema.model_validate(item) for item in items],
    total_count,
    pagination,
  )


@router.get("/rules", summary="List Category Rules", response_model=CategoryRuleListResponse)
async def list_category_rules(session: DBSession, current_user: CurrentDBUser) -> CategoryRuleListResponse:
  rules = await CategoryRuleRepository.from_session(session).list_for_user(current_user.id)
  return CategoryRuleListResponse(items=[CategoryRuleSchema.model_validate(rule) for rule in rules])


@router.post("/rules", summary="Create Category Rule", response_model=CategoryRuleCreated, status_code=201)
async def create_category_rule(body: CategoryRuleCreate, session: DBSession, current_user: CurrentDBUser) -> CategoryRuleCreated:
  """Sorts future imports whose description contains the text into the category, and by default the ones already here."""
  await CategoryRepository.from_session(session).get_owned_or_404(body.category_id, current_user.id, not_found_message="Category not found")
  rule = await CategoryRuleRepository.from_session(session).create(CategoryRule(**body.model_dump(exclude={"apply_now"}), user_id=current_user.id), flush=True)
  categorized = await categorize(session, current_user.id) if body.apply_now else 0
  return CategoryRuleCreated(**CategoryRuleSchema.model_validate(rule).model_dump(), categorized=categorized)


@router.delete("/rules/{rule_id}", summary="Delete Category Rule", status_code=204)
async def delete_category_rule(rule_id: UUID, session: DBSession, current_user: CurrentDBUser) -> None:
  """Stops sorting new imports by it; transactions it already sorted keep their category."""
  repository = CategoryRuleRepository.from_session(session)
  await repository.delete(await repository.get_owned(rule_id, current_user.id), flush=True)
