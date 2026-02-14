from enum import StrEnum
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from api.categories.repository import CategoryRepository
from api.categories.schemas import CategoryCreate, CategoryListResponse, CategorySchema, CategoryUpdate
from api.common.pagination import PaginationParamsQuery
from api.common.sorting import Sorting, SortingGetter
from api.exceptions import ResourceNotFound
from api.models.category import Category
from api.postgres import AsyncSession, get_db_session

router = APIRouter(prefix="/categories", tags=["categories"])


class CategorySortProperty(StrEnum):
  created_at = "created_at"
  name = "name"


sorting_getter = SortingGetter(CategorySortProperty, default_sorting=["name"])


@router.get(
  "",
  summary="List Categories",
  response_model=CategoryListResponse,
)
async def list_categories(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  pagination: PaginationParamsQuery,
  sorting: Annotated[list[Sorting[CategorySortProperty]], Depends(sorting_getter)],
) -> CategoryListResponse:
  """List all categories."""
  repo = CategoryRepository.from_session(session)
  statement = repo.get_base_statement()

  for prop, desc in sorting:
    column = getattr(Category, prop.value)
    statement = statement.order_by(column.desc() if desc else column.asc())

  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  return CategoryListResponse.from_paginated_results(
    [CategorySchema.model_validate(item) for item in items],
    total_count,
    pagination,
  )


@router.post(
  "",
  summary="Create Category",
  response_model=CategorySchema,
  status_code=201,
)
async def create_category(
  body: CategoryCreate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CategorySchema:
  """Create a new category."""
  repo = CategoryRepository.from_session(session)
  category = Category(name=body.name, color=body.color)
  await repo.create(category, flush=True)
  return CategorySchema.model_validate(category)


@router.patch(
  "/{category_id}",
  summary="Update Category",
  response_model=CategorySchema,
)
async def update_category(
  category_id: UUID,
  body: CategoryUpdate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CategorySchema:
  """Update a category."""
  repo = CategoryRepository.from_session(session)
  category = await repo.get_by_id(category_id)
  if category is None:
    raise ResourceNotFound("Category not found")

  update_dict = body.model_dump(exclude_unset=True)
  if update_dict:
    await repo.update(category, update_dict=update_dict)

  return CategorySchema.model_validate(category)


@router.delete(
  "/{category_id}",
  summary="Delete Category",
  status_code=204,
)
async def delete_category(
  category_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
  """Delete a category. Transactions using this category will be uncategorized."""
  repo = CategoryRepository.from_session(session)
  category = await repo.get_by_id(category_id)
  if category is None:
    raise ResourceNotFound("Category not found")
  await session.delete(category)
