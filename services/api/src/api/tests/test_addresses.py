from typing import Any

import httpx
import pytest
from api.addresses import google
from api.addresses.repository import AddressLocationRepository, address_key
from api.models.user import User
from api.settings import settings
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

SESSION = "session-12345"

STOCKHOLM = {
  "formatted_address": "Drottninggatan 5, 111 51 Stockholm, Sverige",
  "geometry": {"location": {"lat": 59.3307, "lng": 18.0631}},
  "address_components": [
    {"long_name": "5", "short_name": "5", "types": ["street_number"]},
    {"long_name": "Drottninggatan", "short_name": "Drottninggatan", "types": ["route"]},
    {"long_name": "Norrmalm", "short_name": "Norrmalm", "types": ["sublocality", "political"]},
    {"long_name": "Stockholm", "short_name": "Stockholm", "types": ["postal_town"]},
    {"long_name": "Stockholms län", "short_name": "Stockholms län", "types": ["administrative_area_level_1", "political"]},
    {"long_name": "Sverige", "short_name": "SE", "types": ["country", "political"]},
    {"long_name": "111 51", "short_name": "111 51", "types": ["postal_code"]},
  ],
}


class FakePlaces:
  def __init__(self) -> None:
    self.requests: list[httpx.Request] = []
    self.status = "OK"
    self.http_status = 200

  def handle(self, request: httpx.Request) -> httpx.Response:
    self.requests.append(request)
    if self.http_status != 200:
      return httpx.Response(self.http_status)
    if request.url.path.endswith("/autocomplete/json"):
      body: dict[str, Any] = {
        "status": self.status,
        "predictions": [
          {
            "place_id": "p1",
            "description": "Drottninggatan 5, Stockholm, Sverige",
            "structured_formatting": {"main_text": "Drottninggatan 5", "secondary_text": "Stockholm, Sverige"},
          },
          {"place_id": "p2", "description": "Drottninggatan 5, Uppsala", "structured_formatting": {}},
          {"description": "no id"},
        ],
      }
    else:
      results = {"p1": STOCKHOLM, "p3": {"address_components": STOCKHOLM["address_components"]}}
      body = {"status": self.status, "result": results.get(request.url.params["place_id"], {})}
    return httpx.Response(200, json=body)


@pytest.fixture
def places(monkeypatch: pytest.MonkeyPatch) -> FakePlaces:
  fake = FakePlaces()
  monkeypatch.setattr(google, "transport", httpx.MockTransport(fake.handle))
  monkeypatch.setattr(settings, "GOOGLE_PLACES_API_KEY", "secret-key")
  return fake


class TestSuggestions:
  @pytest.mark.asyncio
  async def test_suggests_street_addresses_with_the_session(self, client: AsyncClient, places: FakePlaces) -> None:
    response = await client.get("/v1/addresses/suggestions", params={"text": "Drottninggatan 5", "session": SESSION})

    assert response.status_code == 200, response.text
    assert response.json() == {
      "suggestions": [
        {"place_id": "p1", "main_text": "Drottninggatan 5", "secondary_text": "Stockholm, Sverige"},
        {"place_id": "p2", "main_text": "Drottninggatan 5, Uppsala", "secondary_text": None},
      ]
    }
    params = places.requests[0].url.params
    assert (params["input"], params["types"], params["sessiontoken"], params["key"]) == ("Drottninggatan 5", "address", SESSION, "secret-key")

  @pytest.mark.asyncio
  async def test_nothing_found_is_an_empty_list(self, client: AsyncClient, places: FakePlaces) -> None:
    places.status = "ZERO_RESULTS"

    response = await client.get("/v1/addresses/suggestions", params={"text": "Nowhere", "session": SESSION})

    assert response.status_code == 200

  @pytest.mark.asyncio
  @pytest.mark.parametrize(("status", "http_status"), [("REQUEST_DENIED", 200), ("OK", 500)])
  async def test_google_failing_is_a_502_that_never_shows_the_key(self, client: AsyncClient, places: FakePlaces, status: str, http_status: int) -> None:
    places.status, places.http_status = status, http_status

    response = await client.get("/v1/addresses/suggestions", params={"text": "Drottninggatan", "session": SESSION})

    assert response.status_code == 502
    assert "secret-key" not in response.text

  @pytest.mark.asyncio
  async def test_without_a_key_there_are_no_suggestions_and_google_isnt_asked(
    self, client: AsyncClient, places: FakePlaces, monkeypatch: pytest.MonkeyPatch
  ) -> None:
    monkeypatch.setattr(settings, "GOOGLE_PLACES_API_KEY", "")

    response = await client.get("/v1/addresses/suggestions", params={"text": "Drottninggatan", "session": SESSION})

    assert response.json() == {"suggestions": []}
    assert places.requests == []

  @pytest.mark.asyncio
  @pytest.mark.parametrize("params", [{"text": "Dr", "session": SESSION}, {"text": "Drottninggatan", "session": "short"}, {"text": "Drottninggatan"}])
  async def test_needs_three_characters_and_a_session(self, client: AsyncClient, places: FakePlaces, params: dict[str, str]) -> None:
    response = await client.get("/v1/addresses/suggestions", params=params)

    assert response.status_code == 422
    assert places.requests == []


class TestGetAddress:
  @pytest.mark.asyncio
  async def test_gives_the_parts_an_address_book_keeps_and_where_it_is(self, client: AsyncClient, places: FakePlaces) -> None:
    response = await client.get("/v1/addresses/p1", params={"session": SESSION})

    assert response.status_code == 200, response.text
    assert response.json() == {
      "formatted": "Drottninggatan 5, 111 51 Stockholm, Sverige",
      "street_address": "Drottninggatan 5",
      "postal_code": "111 51",
      "city": "Stockholm",
      "region": "Stockholms län",
      "country": "Sverige",
      "country_code": "SE",
      "latitude": 59.3307,
      "longitude": 18.0631,
    }
    params = places.requests[0].url.params
    assert (params["place_id"], params["sessiontoken"]) == ("p1", SESSION)
    assert set(params["fields"].split(",")) == {"address_component", "formatted_address", "geometry"}

  @pytest.mark.asyncio
  @pytest.mark.parametrize("place_id", ["p9", "p3"])
  async def test_an_unknown_place_or_one_with_no_address_is_a_404(self, client: AsyncClient, places: FakePlaces, place_id: str) -> None:
    response = await client.get(f"/v1/addresses/{place_id}", params={"session": SESSION})

    assert response.status_code == 404


class TestPartsOf:
  def test_a_city_named_as_the_locality_where_there_is_no_postal_town(self) -> None:
    result = {
      "formatted_address": "Kungsgatan 1, 411 19 Göteborg",
      "address_components": [
        {"long_name": "Kungsgatan", "short_name": "Kungsgatan", "types": ["route"]},
        {"long_name": "Göteborg", "short_name": "Göteborg", "types": ["locality", "political"]},
        {"long_name": "Sverige", "short_name": "SE", "types": ["country"]},
      ],
    }

    parts = google.parts_of(result)

    assert (parts.street_address, parts.city, parts.postal_code, parts.country_code) == ("Kungsgatan", "Göteborg", None, "SE")
    assert (parts.latitude, parts.longitude) == (None, None)

  def test_the_postal_town_wins_over_the_locality(self) -> None:
    result = {
      "formatted_address": "x",
      "address_components": [
        {"long_name": "Solna", "short_name": "Solna", "types": ["locality"]},
        {"long_name": "Stockholm", "short_name": "Stockholm", "types": ["postal_town"]},
      ],
    }

    assert google.parts_of(result).city == "Stockholm"


class TestLocations:
  @pytest.mark.asyncio
  async def test_are_found_however_the_address_is_spaced_or_capitalised_and_only_for_their_user(
    self, session: AsyncSession, user: User, other_user: User
  ) -> None:
    repository = AddressLocationRepository.from_session(session)
    await repository.save(user.id, "Drottninggatan 5,  111 51 Stockholm", 59.33, 18.06)
    await repository.save(user.id, "drottninggatan 5, 111 51 stockholm", 59.34, 18.07)

    mine = await repository.for_addresses(user.id, ["DROTTNINGGATAN  5, 111 51 Stockholm ", "Elsewhere 1"])
    theirs = await repository.for_addresses(other_user.id, ["Drottninggatan 5, 111 51 Stockholm"])

    assert mine == {"drottninggatan 5, 111 51 stockholm": (59.34, 18.07)}
    assert address_key(" Drottninggatan  5,\n111 51 STOCKHOLM") == "drottninggatan 5, 111 51 stockholm"
    assert theirs == {}
