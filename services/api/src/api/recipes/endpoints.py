from enum import StrEnum
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from api.common.pagination import PaginationParamsQuery
from api.common.sorting import Sorting, SortingGetter
from api.exceptions import ResourceNotFound
from api.models.recipe import Recipe
from api.postgres import AsyncSession, get_db_session
from api.recipes.repository import RecipeRepository
from api.recipes.schemas import RecipeCreate, RecipeListResponse, RecipeSchema, RecipeUpdate

router = APIRouter(prefix="/recipes", tags=["recipes"])


class RecipeSortProperty(StrEnum):
  created_at = "created_at"
  title = "title"
  modified_at = "modified_at"


sorting_getter = SortingGetter(RecipeSortProperty, default_sorting=["title"])


@router.get("", summary="List Recipes", response_model=RecipeListResponse)
async def list_recipes(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  pagination: PaginationParamsQuery,
  sorting: Annotated[list[Sorting[RecipeSortProperty]], Depends(sorting_getter)],
  search: str | None = Query(default=None, description="Search by title."),
) -> RecipeListResponse:
  repo = RecipeRepository.from_session(session)
  statement = repo.get_base_statement()

  if search:
    statement = statement.where(Recipe.title.ilike(f"%{search}%"))

  for prop, descending in sorting:
    col = getattr(Recipe, prop.value)
    statement = statement.order_by(col.desc() if descending else col.asc())

  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  return RecipeListResponse.from_paginated_results(items, total_count, pagination)


@router.post("", summary="Create Recipe", response_model=RecipeSchema, status_code=201)
async def create_recipe(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  body: RecipeCreate,
) -> RecipeSchema:
  repo = RecipeRepository.from_session(session)
  recipe = await repo.create(Recipe(title=body.title, content=body.content), flush=True)
  return RecipeSchema.model_validate(recipe)


@router.get("/{recipe_id}", summary="Get Recipe", response_model=RecipeSchema)
async def get_recipe(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  recipe_id: UUID,
) -> RecipeSchema:
  repo = RecipeRepository.from_session(session)
  recipe = await repo.get_by_id(recipe_id)
  if not recipe:
    raise ResourceNotFound(detail="Recipe not found.")
  return RecipeSchema.model_validate(recipe)


@router.patch("/{recipe_id}", summary="Update Recipe", response_model=RecipeSchema)
async def update_recipe(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  recipe_id: UUID,
  body: RecipeUpdate,
) -> RecipeSchema:
  repo = RecipeRepository.from_session(session)
  recipe = await repo.get_by_id(recipe_id)
  if not recipe:
    raise ResourceNotFound(detail="Recipe not found.")
  update_data = body.model_dump(exclude_unset=True)
  recipe = await repo.update(recipe, update_dict=update_data)
  return RecipeSchema.model_validate(recipe)


@router.delete("/{recipe_id}", summary="Delete Recipe", status_code=204)
async def delete_recipe(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  recipe_id: UUID,
) -> None:
  repo = RecipeRepository.from_session(session)
  recipe = await repo.get_by_id(recipe_id)
  if not recipe:
    raise ResourceNotFound(detail="Recipe not found.")
  await session.delete(recipe)
