from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..models.place_status import PlaceStatus
from ..types import UNSET, Unset

T = TypeVar("T", bound="PlaceUpdate")


@_attrs_define
class PlaceUpdate:
  """
  Attributes:
      name (None | str | Unset):
      address (None | str | Unset):
      country (None | str | Unset):
      latitude (float | None | Unset):
      longitude (float | None | Unset):
      status (None | PlaceStatus | Unset):
      rating (int | None | Unset):
      visited_at (datetime.date | None | Unset):
      review (None | str | Unset):
      category (None | str | Unset):
      tags (list[str] | None | Unset):
      photo_url (None | str | Unset):
      website (None | str | Unset):
      phone (None | str | Unset):
  """

  name: None | str | Unset = UNSET
  address: None | str | Unset = UNSET
  country: None | str | Unset = UNSET
  latitude: float | None | Unset = UNSET
  longitude: float | None | Unset = UNSET
  status: None | PlaceStatus | Unset = UNSET
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
    name: None | str | Unset
    if isinstance(self.name, Unset):
      name = UNSET
    else:
      name = self.name

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

    latitude: float | None | Unset
    if isinstance(self.latitude, Unset):
      latitude = UNSET
    else:
      latitude = self.latitude

    longitude: float | None | Unset
    if isinstance(self.longitude, Unset):
      longitude = UNSET
    else:
      longitude = self.longitude

    status: None | str | Unset
    if isinstance(self.status, Unset):
      status = UNSET
    elif isinstance(self.status, PlaceStatus):
      status = self.status.value
    else:
      status = self.status

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
    field_dict.update({})
    if name is not UNSET:
      field_dict["name"] = name
    if address is not UNSET:
      field_dict["address"] = address
    if country is not UNSET:
      field_dict["country"] = country
    if latitude is not UNSET:
      field_dict["latitude"] = latitude
    if longitude is not UNSET:
      field_dict["longitude"] = longitude
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

    def _parse_name(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    name = _parse_name(d.pop("name", UNSET))

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

    def _parse_latitude(data: object) -> float | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(float | None | Unset, data)

    latitude = _parse_latitude(d.pop("latitude", UNSET))

    def _parse_longitude(data: object) -> float | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(float | None | Unset, data)

    longitude = _parse_longitude(d.pop("longitude", UNSET))

    def _parse_status(data: object) -> None | PlaceStatus | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        status_type_0 = PlaceStatus(data)

        return status_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(None | PlaceStatus | Unset, data)

    status = _parse_status(d.pop("status", UNSET))

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

    place_update = cls(
      name=name,
      address=address,
      country=country,
      latitude=latitude,
      longitude=longitude,
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

    place_update.additional_properties = d
    return place_update

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
