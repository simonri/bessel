from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="GooglePlaceSearchResult")


@_attrs_define
class GooglePlaceSearchResult:
  """
  Attributes:
      place_id (str): Google Place ID.
      name (str): Place name.
      address (str): Formatted address.
      latitude (float): Latitude.
      longitude (float): Longitude.
      country (None | str | Unset): Country name.
      plus_code (None | str | Unset): Plus Code.
      category (None | str | Unset): Primary type.
      photo_url (None | str | Unset): Photo reference URL.
      website (None | str | Unset): Website.
      phone (None | str | Unset): Phone number.
  """

  place_id: str
  name: str
  address: str
  latitude: float
  longitude: float
  country: None | str | Unset = UNSET
  plus_code: None | str | Unset = UNSET
  category: None | str | Unset = UNSET
  photo_url: None | str | Unset = UNSET
  website: None | str | Unset = UNSET
  phone: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    place_id = self.place_id

    name = self.name

    address = self.address

    latitude = self.latitude

    longitude = self.longitude

    country: None | str | Unset
    if isinstance(self.country, Unset):
      country = UNSET
    else:
      country = self.country

    plus_code: None | str | Unset
    if isinstance(self.plus_code, Unset):
      plus_code = UNSET
    else:
      plus_code = self.plus_code

    category: None | str | Unset
    if isinstance(self.category, Unset):
      category = UNSET
    else:
      category = self.category

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
        "place_id": place_id,
        "name": name,
        "address": address,
        "latitude": latitude,
        "longitude": longitude,
      }
    )
    if country is not UNSET:
      field_dict["country"] = country
    if plus_code is not UNSET:
      field_dict["plus_code"] = plus_code
    if category is not UNSET:
      field_dict["category"] = category
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
    place_id = d.pop("place_id")

    name = d.pop("name")

    address = d.pop("address")

    latitude = d.pop("latitude")

    longitude = d.pop("longitude")

    def _parse_country(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    country = _parse_country(d.pop("country", UNSET))

    def _parse_plus_code(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    plus_code = _parse_plus_code(d.pop("plus_code", UNSET))

    def _parse_category(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    category = _parse_category(d.pop("category", UNSET))

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

    google_place_search_result = cls(
      place_id=place_id,
      name=name,
      address=address,
      latitude=latitude,
      longitude=longitude,
      country=country,
      plus_code=plus_code,
      category=category,
      photo_url=photo_url,
      website=website,
      phone=phone,
    )

    google_place_search_result.additional_properties = d
    return google_place_search_result

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
