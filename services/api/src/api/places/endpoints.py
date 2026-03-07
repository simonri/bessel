from enum import StrEnum
from typing import Annotated
from uuid import UUID

import httpx
from api.common.pagination import PaginationParamsQuery
from api.common.sorting import Sorting, SortingGetter
from api.exceptions import ResourceNotFound
from api.models.place import Place
from api.places.repository import PlaceRepository
from api.places.schemas import GooglePlaceSearchResponse, GooglePlaceSearchResult, PlaceCreate, PlaceListResponse, PlaceSchema, PlaceStatus, PlaceUpdate
from api.postgres import AsyncSession, get_db_session
from api.settings import settings
from fastapi import APIRouter, Depends, Query

router = APIRouter(prefix="/places", tags=["places"])


class PlaceSortProperty(StrEnum):
  created_at = "created_at"
  name = "name"
  rating = "rating"
  visited_at = "visited_at"


sorting_getter = SortingGetter(PlaceSortProperty, default_sorting=["-created_at"])


@router.get(
  "",
  summary="List Places",
  response_model=PlaceListResponse,
)
async def list_places(
  session: Annotated[AsyncSession, Depends(get_db_session)],
  pagination: PaginationParamsQuery,
  sorting: Annotated[list[Sorting[PlaceSortProperty]], Depends(sorting_getter)],
  status: PlaceStatus | None = Query(default=None, description="Filter by status."),
) -> PlaceListResponse:
  repo = PlaceRepository.from_session(session)
  statement = repo.get_base_statement()

  if status is not None:
    statement = statement.where(Place.status == status)

  for prop, desc in sorting:
    column = getattr(Place, prop.value)
    statement = statement.order_by(column.desc() if desc else column.asc())

  items, total_count = await repo.paginate(statement, limit=pagination.limit, page=pagination.page)
  return PlaceListResponse.from_paginated_results(
    [PlaceSchema.model_validate(item) for item in items],
    total_count,
    pagination,
  )


@router.get(
  "/search",
  summary="Search Google Places",
  response_model=GooglePlaceSearchResponse,
)
async def search_google_places(
  query: str = Query(..., description="Search query for Google Places."),
) -> GooglePlaceSearchResponse:
  api_key = settings.GOOGLE_PLACES_API_KEY
  if not api_key:
    return GooglePlaceSearchResponse(results=[])

  async with httpx.AsyncClient() as http_client:
    response = await http_client.get(
      "https://maps.googleapis.com/maps/api/place/textsearch/json",
      params={"query": query, "key": api_key},
      timeout=10,
    )
    data = response.json()

  results: list[GooglePlaceSearchResult] = []
  for item in data.get("results", [])[:10]:
    location = item.get("geometry", {}).get("location", {})
    plus_code_data = item.get("plus_code", {})

    photo_url = None
    photos = item.get("photos", [])
    if photos:
      photo_ref = photos[0].get("photo_reference")
      if photo_ref:
        photo_url = f"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference={photo_ref}&key={api_key}"

    # Extract country from formatted_address (last component after comma)
    formatted_address = item.get("formatted_address", "")
    country = None
    if formatted_address:
      parts = [p.strip() for p in formatted_address.split(",")]
      if len(parts) >= 2:
        country = parts[-1]

    results.append(
      GooglePlaceSearchResult(
        place_id=item.get("place_id", ""),
        name=item.get("name", ""),
        address=formatted_address,
        country=country,
        latitude=location.get("lat", 0),
        longitude=location.get("lng", 0),
        plus_code=plus_code_data.get("global_code"),
        category=item.get("types", [None])[0] if item.get("types") else None,
        photo_url=photo_url,
        website=None,
        phone=None,
      )
    )

  return GooglePlaceSearchResponse(results=results)


@router.post(
  "",
  summary="Create Place",
  response_model=PlaceSchema,
  status_code=201,
)
async def create_place(
  body: PlaceCreate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PlaceSchema:
  repo = PlaceRepository.from_session(session)
  place = Place(**body.model_dump())
  await repo.create(place, flush=True)
  return PlaceSchema.model_validate(place)


@router.patch(
  "/{place_id}",
  summary="Update Place",
  response_model=PlaceSchema,
)
async def update_place(
  place_id: UUID,
  body: PlaceUpdate,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PlaceSchema:
  repo = PlaceRepository.from_session(session)
  place = await repo.get_by_id(place_id)
  if place is None:
    raise ResourceNotFound("Place not found")

  update_dict = body.model_dump(exclude_unset=True)
  if update_dict:
    await repo.update(place, update_dict=update_dict)

  return PlaceSchema.model_validate(place)


@router.delete(
  "/{place_id}",
  summary="Delete Place",
  status_code=204,
)
async def delete_place(
  place_id: UUID,
  session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
  repo = PlaceRepository.from_session(session)
  place = await repo.get_by_id(place_id)
  if place is None:
    raise ResourceNotFound("Place not found")
  await session.delete(place)
