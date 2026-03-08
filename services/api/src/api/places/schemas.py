from datetime import date
from enum import StrEnum

from pydantic import Field

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema


class PlaceStatus(StrEnum):
    want_to_go = "want_to_go"
    visited = "visited"


class PlaceSchema(IDSchema, TimestampedSchema):
    name: str = Field(description="Place name.")
    address: str | None = Field(default=None, description="Full address.")
    country: str | None = Field(default=None, description="Country name.")
    latitude: float = Field(description="Latitude coordinate.")
    longitude: float = Field(description="Longitude coordinate.")
    google_place_id: str | None = Field(default=None, description="Google Maps place ID.")
    plus_code: str | None = Field(default=None, description="Google Plus Code.")
    status: PlaceStatus = Field(default=PlaceStatus.want_to_go, description="Place status.")
    rating: int | None = Field(default=None, description="Personal rating (1-5).")
    visited_at: date | None = Field(default=None, description="Date when the place was visited.")
    review: str | None = Field(default=None, description="Personal review/notes.")
    category: str | None = Field(default=None, description="Place category (e.g. restaurant, cafe).")
    tags: list[str] | None = Field(default=None, description="User-defined tags.")
    photo_url: str | None = Field(default=None, description="Photo URL from Google.")
    website: str | None = Field(default=None, description="Website URL.")
    phone: str | None = Field(default=None, description="Phone number.")


class PlaceCreate(Schema):
    name: str = Field(description="Place name.", max_length=255)
    address: str | None = Field(default=None, max_length=500)
    country: str | None = Field(default=None, max_length=100)
    latitude: float = Field(description="Latitude coordinate.")
    longitude: float = Field(description="Longitude coordinate.")
    google_place_id: str | None = Field(default=None, max_length=255)
    plus_code: str | None = Field(default=None, max_length=50)
    status: PlaceStatus = Field(default=PlaceStatus.want_to_go)
    rating: int | None = Field(default=None, ge=1, le=5)
    visited_at: date | None = Field(default=None)
    review: str | None = Field(default=None)
    category: str | None = Field(default=None, max_length=100)
    tags: list[str] | None = Field(default=None)
    photo_url: str | None = Field(default=None)
    website: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=50)


class PlaceUpdate(Schema):
    name: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=500)
    country: str | None = Field(default=None, max_length=100)
    latitude: float | None = Field(default=None)
    longitude: float | None = Field(default=None)
    status: PlaceStatus | None = Field(default=None)
    rating: int | None = Field(default=None, ge=1, le=5)
    visited_at: date | None = Field(default=None)
    review: str | None = Field(default=None)
    category: str | None = Field(default=None, max_length=100)
    tags: list[str] | None = Field(default=None)
    photo_url: str | None = Field(default=None)
    website: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=50)


class PlaceListResponse(ListResource[PlaceSchema]):
    pass


class GooglePlaceSearchResult(Schema):
    place_id: str = Field(description="Google Place ID.")
    name: str = Field(description="Place name.")
    address: str = Field(description="Formatted address.")
    country: str | None = Field(default=None, description="Country name.")
    latitude: float = Field(description="Latitude.")
    longitude: float = Field(description="Longitude.")
    plus_code: str | None = Field(default=None, description="Plus Code.")
    category: str | None = Field(default=None, description="Primary type.")
    photo_url: str | None = Field(default=None, description="Photo reference URL.")
    website: str | None = Field(default=None, description="Website.")
    phone: str | None = Field(default=None, description="Phone number.")


class GooglePlaceSearchResponse(Schema):
    results: list[GooglePlaceSearchResult]
