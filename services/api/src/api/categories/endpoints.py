from typing import Annotated

from fastapi import APIRouter, Depends

from api.categories.repository import CategoryRepository
from api.categories.schemas import CategoryListResponse, CategorySchema
from api.common.pagination import PaginationParamsQuery
from api.models.category import Category
from api.postgres import AsyncSession, get_db_session

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get(
  "",
  summary="List Categories",
  response_model=CategoryListResponse,
)
async def list_categories(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  pagination: PaginationParamsQuery,
) -> CategoryListResponse:
  """List all categories."""
  repo = CategoryRepository.from_session(session)
  statement = repo.get_base_statement().order_by(Category.name.asc())

  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  return CategoryListResponse.from_paginated_results(
    [CategorySchema.model_validate(item) for item in items],
    total_count,
    pagination,
  )
