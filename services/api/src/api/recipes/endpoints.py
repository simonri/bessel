from datetime import date
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from api.common.pagination import PaginationParamsQuery
from api.common.sorting import Sorting, SortingGetter, apply_sorting
from api.models.recipe import Recipe
from api.postgres import DBSession
from api.recipes.importer import import_recipe
from api.recipes.repository import CookStats, RecipeCookRepository, RecipeRepository
from api.recipes.schemas import (
  RecipeCookHistory,
  RecipeCookResult,
  RecipeCreate,
  RecipeImportRequest,
  RecipeImportResult,
  RecipeListResponse,
  RecipeSchema,
  RecipeUpdate,
)
from api.recipes.service import content_fields, recipe_service
from api.users.dependencies import CurrentDBUser

router = APIRouter(prefix="/recipes", tags=["recipes"])


class RecipeSortProperty(StrEnum):
  created_at = "created_at"
  title_ = "title"
  modified_at = "modified_at"


sorting_getter = SortingGetter(RecipeSortProperty, default_sorting=["title"])


def with_cooks(recipe: Recipe, stats: dict[UUID, CookStats]) -> RecipeSchema:
  return RecipeSchema.from_recipe(recipe, stats.get(recipe.id, CookStats()))


async def recipe_with_cooks(session: DBSession, recipe: Recipe) -> RecipeSchema:
  return with_cooks(recipe, await RecipeCookRepository.from_session(session).stats([recipe.id]))


@router.get("", summary="List Recipes", response_model=RecipeListResponse)
async def list_recipes(
  session: DBSession,
  current_user: CurrentDBUser,
  pagination: PaginationParamsQuery,
  sorting: Annotated[list[Sorting[RecipeSortProperty]], Depends(sorting_getter)],
  search: str | None = Query(default=None, description="Search by title."),
) -> RecipeListResponse:
  repo = RecipeRepository.from_session(session)
  statement = apply_sorting(repo.get_filtered_statement(current_user.id, search=search), Recipe, sorting)

  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  stats = await RecipeCookRepository.from_session(session).stats([item.id for item in items])
  return RecipeListResponse.from_paginated_results([with_cooks(item, stats) for item in items], total_count, pagination)


@router.post("", summary="Create Recipe", response_model=RecipeSchema, status_code=201)
async def create_recipe(
  session: DBSession,
  current_user: CurrentDBUser,
  body: RecipeCreate,
) -> RecipeSchema:
  recipe = await recipe_service.create(session, current_user, title=body.title, recipe_type=body.recipe_type, content=body.content, body=body.body)
  return RecipeSchema.from_recipe(recipe, CookStats())


@router.post("/import", summary="Structure Recipe Text", response_model=RecipeImportResult)
async def structure_recipe_text(_current_user: CurrentDBUser, body: RecipeImportRequest) -> RecipeImportResult:
  """Turn free-form recipe text into the structured format with an LLM. Nothing is saved."""
  return await import_recipe(body.text)


@router.get("/{recipe_id}", summary="Get Recipe", response_model=RecipeSchema)
async def get_recipe(
  session: DBSession,
  current_user: CurrentDBUser,
  recipe_id: UUID,
) -> RecipeSchema:
  repo = RecipeRepository.from_session(session)
  recipe = await repo.get_owned_or_404(recipe_id, current_user.id, not_found_message="Recipe not found.")
  return await recipe_with_cooks(session, recipe)


@router.patch("/{recipe_id}", summary="Update Recipe", response_model=RecipeSchema)
async def update_recipe(
  session: DBSession,
  current_user: CurrentDBUser,
  recipe_id: UUID,
  body: RecipeUpdate,
) -> RecipeSchema:
  repo = RecipeRepository.from_session(session)
  recipe = await repo.get_owned_or_404(recipe_id, current_user.id, not_found_message="Recipe not found.")
  update_data = body.model_dump(exclude_unset=True, exclude={"content", "body"})
  if body.body is not None:
    update_data |= content_fields("", body.body)
  elif body.content is not None:
    # A client that only edits markdown (older desktop builds): the stored
    # structure is now stale, so the markdown becomes the source again.
    update_data |= content_fields(body.content, None)
  recipe = await repo.update(recipe, update_dict=update_data)
  return await recipe_with_cooks(session, recipe)


@router.delete("/{recipe_id}", summary="Delete Recipe", status_code=204)
async def delete_recipe(
  session: DBSession,
  current_user: CurrentDBUser,
  recipe_id: UUID,
) -> None:
  repo = RecipeRepository.from_session(session)
  recipe = await repo.get_owned_or_404(recipe_id, current_user.id, not_found_message="Recipe not found.")
  await repo.delete(recipe)


@router.get("/{recipe_id}/cooks", summary="List Recipe Cooks", response_model=RecipeCookHistory)
async def list_recipe_cooks(session: DBSession, current_user: CurrentDBUser, recipe_id: UUID) -> RecipeCookHistory:
  recipe = await RecipeRepository.from_session(session).get_owned_or_404(recipe_id, current_user.id, not_found_message="Recipe not found.")
  return RecipeCookHistory(days=list(await RecipeCookRepository.from_session(session).days(recipe)))


@router.put("/{recipe_id}/cooks/{cooked_on}", summary="Log Recipe Cooked", response_model=RecipeCookResult)
async def log_recipe_cooked(session: DBSession, current_user: CurrentDBUser, recipe_id: UUID, cooked_on: date) -> RecipeCookResult:
  """Logs that the recipe was cooked on the app's local day. Logging a day twice changes nothing."""
  recipe = await RecipeRepository.from_session(session).get_owned_or_404(recipe_id, current_user.id, not_found_message="Recipe not found.")
  created = await recipe_service.log_cook(RecipeCookRepository.from_session(session), recipe, cooked_on)
  return RecipeCookResult(recipe=await recipe_with_cooks(session, recipe), created=created)


@router.delete("/{recipe_id}/cooks/{cooked_on}", summary="Remove Recipe Cooked", response_model=RecipeSchema)
async def remove_recipe_cooked(session: DBSession, current_user: CurrentDBUser, recipe_id: UUID, cooked_on: date) -> RecipeSchema:
  recipe = await RecipeRepository.from_session(session).get_owned_or_404(recipe_id, current_user.id, not_found_message="Recipe not found.")
  await recipe_service.remove_cook(RecipeCookRepository.from_session(session), recipe, cooked_on)
  return await recipe_with_cooks(session, recipe)
