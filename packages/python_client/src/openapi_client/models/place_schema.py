from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..models.place_status import PlaceStatus
from ..types import UNSET, Unset

T = TypeVar("T", bound="PlaceSchema")


@_attrs_define
class PlaceSchema:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      name (str): Place name.
      latitude (float): Latitude coordinate.
      longitude (float): Longitude coordinate.
      address (None | str | Unset): Full address.
      country (None | str | Unset): Country name.
      google_place_id (None | str | Unset): Google Maps place ID.
      plus_code (None | str | Unset): Google Plus Code.
      status (PlaceStatus | Unset):
      rating (int | None | Unset): Personal rating (1-5).
      visited_at (datetime.date | None | Unset): Date when the place was visited.
      review (None | str | Unset): Personal review/notes.
      category (None | str | Unset): Place category (e.g. restaurant, cafe).
      tags (list[str] | None | Unset): User-defined tags.
      photo_url (None | str | Unset): Photo URL from Google.
      website (None | str | Unset): Website URL.
      phone (None | str | Unset): Phone number.
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  name: str
  latitude: float
  longitude: float
  address: None | str | Unset = UNSET
  country: None | str | Unset = UNSET
  google_place_id: None | str | Unset = UNSET
  plus_code: None | str | Unset = UNSET
  status: PlaceStatus | Unset = UNSET
  rating: int | None | Unset = UNSET
  visited_at: datetime.date | None | Unset = UNSET
  review: None | str | Unset = UNSET
  category: None | str | Unset = UNSET
  tags: list[str] | None | Unset = UNSET
  photo_url: None | str | Unset = UNSET
  website: None | str | Unset = UNSET
  phone: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    created_at = self.created_at.isoformat()

    modified_at: None | str
    if isinstance(self.modified_at, datetime.datetime):
      modified_at = self.modified_at.isoformat()
    else:
      modified_at = self.modified_at

    id = self.id

    name = self.name

    latitude = self.latitude

    longitude = self.longitude

    address: None | str | Unset
    if isinstance(self.address, Unset):
      address = UNSET
    else:
      address = self.address

    country: None | str | Unset
    if isinstance(self.country, Unset):
      country = UNSET
    else:
      country = self.country

    google_place_id: None | str | Unset
    if isinstance(self.google_place_id, Unset):
      google_place_id = UNSET
    else:
      google_place_id = self.google_place_id

    plus_code: None | str | Unset
    if isinstance(self.plus_code, Unset):
      plus_code = UNSET
    else:
      plus_code = self.plus_code

    status: str | Unset = UNSET
    if not isinstance(self.status, Unset):
      status = self.status.value

    rating: int | None | Unset
    if isinstance(self.rating, Unset):
      rating = UNSET
    else:
      rating = self.rating

    visited_at: None | str | Unset
    if isinstance(self.visited_at, Unset):
      visited_at = UNSET
    elif isinstance(self.visited_at, datetime.date):
      visited_at = self.visited_at.isoformat()
    else:
      visited_at = self.visited_at

    review: None | str | Unset
    if isinstance(self.review, Unset):
      review = UNSET
    else:
      review = self.review

    category: None | str | Unset
    if isinstance(self.category, Unset):
      category = UNSET
    else:
      category = self.category

    tags: list[str] | None | Unset
    if isinstance(self.tags, Unset):
      tags = UNSET
    elif isinstance(self.tags, list):
      tags = self.tags

    else:
      tags = self.tags

    photo_url: None | str | Unset
    if isinstance(self.photo_url, Unset):
      photo_url = UNSET
    else:
      photo_url = self.photo_url

    website: None | str | Unset
    if isinstance(self.website, Unset):
      website = UNSET
    else:
      website = self.website

    phone: None | str | Unset
    if isinstance(self.phone, Unset):
      phone = UNSET
    else:
      phone = self.phone

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "created_at": created_at,
        "modified_at": modified_at,
        "id": id,
        "name": name,
        "latitude": latitude,
        "longitude": longitude,
      }
    )
    if address is not UNSET:
      field_dict["address"] = address
    if country is not UNSET:
      field_dict["country"] = country
    if google_place_id is not UNSET:
      field_dict["google_place_id"] = google_place_id
    if plus_code is not UNSET:
      field_dict["plus_code"] = plus_code
    if status is not UNSET:
      field_dict["status"] = status
    if rating is not UNSET:
      field_dict["rating"] = rating
    if visited_at is not UNSET:
      field_dict["visited_at"] = visited_at
    if review is not UNSET:
      field_dict["review"] = review
    if category is not UNSET:
      field_dict["category"] = category
    if tags is not UNSET:
      field_dict["tags"] = tags
    if photo_url is not UNSET:
      field_dict["photo_url"] = photo_url
    if website is not UNSET:
      field_dict["website"] = website
    if phone is not UNSET:
      field_dict["phone"] = phone

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    created_at = isoparse(d.pop("created_at"))

    def _parse_modified_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        modified_at_type_0 = isoparse(data)

        return modified_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None, data)

    modified_at = _parse_modified_at(d.pop("modified_at"))

    id = d.pop("id")

    name = d.pop("name")

    latitude = d.pop("latitude")

    longitude = d.pop("longitude")

    def _parse_address(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    address = _parse_address(d.pop("address", UNSET))

    def _parse_country(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    country = _parse_country(d.pop("country", UNSET))

    def _parse_google_place_id(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    google_place_id = _parse_google_place_id(d.pop("google_place_id", UNSET))

    def _parse_plus_code(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    plus_code = _parse_plus_code(d.pop("plus_code", UNSET))

    _status = d.pop("status", UNSET)
    status: PlaceStatus | Unset
    if isinstance(_status, Unset):
      status = UNSET
    else:
      status = PlaceStatus(_status)

    def _parse_rating(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    rating = _parse_rating(d.pop("rating", UNSET))

    def _parse_visited_at(data: object) -> datetime.date | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        visited_at_type_0 = isoparse(data).date()

        return visited_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.date | None | Unset, data)

    visited_at = _parse_visited_at(d.pop("visited_at", UNSET))

    def _parse_review(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    review = _parse_review(d.pop("review", UNSET))

    def _parse_category(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    category = _parse_category(d.pop("category", UNSET))

    def _parse_tags(data: object) -> list[str] | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, list):
          raise TypeError()
        tags_type_0 = cast(list[str], data)

        return tags_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(list[str] | None | Unset, data)

    tags = _parse_tags(d.pop("tags", UNSET))

    def _parse_photo_url(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    photo_url = _parse_photo_url(d.pop("photo_url", UNSET))

    def _parse_website(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    website = _parse_website(d.pop("website", UNSET))

    def _parse_phone(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    phone = _parse_phone(d.pop("phone", UNSET))

    place_schema = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
      name=name,
      latitude=latitude,
      longitude=longitude,
      address=address,
      country=country,
      google_place_id=google_place_id,
      plus_code=plus_code,
      status=status,
      rating=rating,
      visited_at=visited_at,
      review=review,
      category=category,
      tags=tags,
      photo_url=photo_url,
      website=website,
      phone=phone,
    )

    place_schema.additional_properties = d
    return place_schema

  @property
  def additional_keys(self) -> list[str]:
    return list(self.additional_properties.keys())

  def __getitem__(self, key: str) -> Any:
    return self.additional_properties[key]

  def __setitem__(self, key: str, value: Any) -> None:
    self.additional_properties[key] = value

  def __delitem__(self, key: str) -> None:
    del self.additional_properties[key]

  def __contains__(self, key: str) -> bool:
    return key in self.additional_properties
