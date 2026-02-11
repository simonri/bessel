import math
from collections.abc import Sequence
from typing import Annotated, Any, NamedTuple, Self

from fastapi import Depends, Query
from pydantic import BaseModel, GetCoreSchemaHandler
from pydantic_core import CoreSchema

from api.common.schemas import Schema


class PaginationParams(NamedTuple):
  page: int
  limit: int


class Pagination(Schema):
  total_count: int
  max_page: int


API_PAGINATION_MAX_LIMIT = 100


async def get_pagination_params(
  page: int = Query(1, description="Page number, defaults to 1.", gt=0),
  limit: int = Query(
    10,
    description=(f"Size of a page, defaults to 10. Maximum is {API_PAGINATION_MAX_LIMIT}."),
    gt=0,
  ),
) -> PaginationParams:
  return PaginationParams(page, min(API_PAGINATION_MAX_LIMIT, limit))


PaginationParamsQuery = Annotated[PaginationParams, Depends(get_pagination_params)]


class ListResource[T: Any](Schema):
  items: list[T]
  pagination: Pagination

  @classmethod
  def from_paginated_results(cls, items: Sequence[T], total_count: int, pagination_params: PaginationParams) -> Self:
    return cls(
      items=list(items),
      pagination=Pagination(
        total_count=total_count,
        max_page=math.ceil(total_count / pagination_params.limit),
      ),
    )

  @classmethod
  def __get_pydantic_core_schema__(cls, source: type[BaseModel], handler: GetCoreSchemaHandler, /) -> CoreSchema:
    """
    Override the schema to set the `ref` field to the overridden class name.
    """
    result = handler(source)
    result["ref"] = cls.__name__  # type: ignore
    return result
