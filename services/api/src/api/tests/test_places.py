from typing import Any

import pytest
from httpx import AsyncClient

PLACE: dict[str, Any] = {"name": "Kafé Exempel", "latitude": 10.5, "longitude": 20.5, "google_place_id": "ChIJexample-place"}


class TestCreatePlace:
  @pytest.mark.asyncio
  async def test_two_users_can_save_the_same_google_place(self, client: AsyncClient, other_client: AsyncClient) -> None:
    assert (await client.post("/v1/places", json=PLACE)).status_code == 201

    resp = await other_client.post("/v1/places", json=PLACE)

    assert resp.status_code == 201, resp.text
    assert [p["name"] for p in (await other_client.get("/v1/places")).json()["items"]] == ["Kafé Exempel"]

  @pytest.mark.asyncio
  async def test_saving_a_google_place_twice_is_a_conflict(self, client: AsyncClient) -> None:
    assert (await client.post("/v1/places", json=PLACE)).status_code == 201

    resp = await client.post("/v1/places", json=PLACE)

    assert resp.status_code == 409
    assert len((await client.get("/v1/places")).json()["items"]) == 1
