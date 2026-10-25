from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from pytest_mock import MockerFixture


class TestRecipeType:
  @pytest.mark.asyncio
  async def test_create_defaults_to_other(self, client: AsyncClient) -> None:
    resp = await client.post("/v1/recipes", json={"title": "Pancakes", "content": ""})
    assert resp.status_code == 201
    assert resp.json()["recipe_type"] == "other"

  @pytest.mark.asyncio
  async def test_create_with_explicit_type(self, client: AsyncClient) -> None:
    resp = await client.post("/v1/recipes", json={"title": "Tiramisu", "content": "", "recipe_type": "dessert"})
    assert resp.status_code == 201
    assert resp.json()["recipe_type"] == "dessert"

  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_update_type(self, client: AsyncClient) -> None:
    created = await client.post("/v1/recipes", json={"title": "Lasagna", "content": ""})
    recipe_id = created.json()["id"]

    resp = await client.patch(f"/v1/recipes/{recipe_id}", json={"recipe_type": "main"})
    assert resp.status_code == 200
    assert resp.json()["recipe_type"] == "main"

    fetched = await client.get(f"/v1/recipes/{recipe_id}")
    assert fetched.json()["recipe_type"] == "main"

  @pytest.mark.asyncio
  async def test_rejects_invalid_type(self, client: AsyncClient) -> None:
    resp = await client.post("/v1/recipes", json={"title": "Bad", "content": "", "recipe_type": "snack"})
    assert resp.status_code == 422


async def _recipe(client: AsyncClient, title: str = "Carbonara") -> str:
  resp = await client.post("/v1/recipes", json={"title": title})
  assert resp.status_code == 201
  assert (resp.json()["last_cooked_on"], resp.json()["cook_count"]) == (None, 0)
  return resp.json()["id"]


@pytest.mark.keep_session_state
class TestRecipeCooks:
  @pytest.mark.asyncio
  async def test_logging_a_day_counts_it_and_moves_last_cooked_to_the_latest(self, client: AsyncClient) -> None:
    recipe_id = await _recipe(client)

    first = await client.put(f"/v1/recipes/{recipe_id}/cooks/2026-10-08")
    earlier = await client.put(f"/v1/recipes/{recipe_id}/cooks/2026-09-20")

    assert first.status_code == 200
    assert first.json()["created"] is True
    assert (first.json()["recipe"]["last_cooked_on"], first.json()["recipe"]["cook_count"]) == ("2026-10-08", 1)
    assert (earlier.json()["recipe"]["last_cooked_on"], earlier.json()["recipe"]["cook_count"]) == ("2026-10-08", 2)
    fetched = (await client.get(f"/v1/recipes/{recipe_id}")).json()
    assert (fetched["last_cooked_on"], fetched["cook_count"]) == ("2026-10-08", 2)
    renamed = (await client.patch(f"/v1/recipes/{recipe_id}", json={"title": "Pasta carbonara"})).json()
    assert (renamed["last_cooked_on"], renamed["cook_count"]) == ("2026-10-08", 2)

  @pytest.mark.asyncio
  async def test_the_day_reads_the_same_as_the_web_client_sends_it(self, client: AsyncClient) -> None:
    """The generated web client writes a Date path parameter as an ISO timestamp at UTC midnight."""
    recipe_id = await _recipe(client)

    logged = await client.put(f"/v1/recipes/{recipe_id}/cooks/2026-10-08T00:00:00.000Z")
    removed = await client.delete(f"/v1/recipes/{recipe_id}/cooks/2026-10-08T00:00:00.000Z")

    assert logged.json()["recipe"]["last_cooked_on"] == "2026-10-08"
    assert removed.status_code == 200

  @pytest.mark.asyncio
  async def test_logging_the_same_day_twice_changes_nothing_and_says_so(self, client: AsyncClient) -> None:
    recipe_id = await _recipe(client)
    await client.put(f"/v1/recipes/{recipe_id}/cooks/2026-10-08")

    again = await client.put(f"/v1/recipes/{recipe_id}/cooks/2026-10-08")

    assert again.status_code == 200
    assert again.json()["created"] is False
    assert again.json()["recipe"]["cook_count"] == 1

  @pytest.mark.asyncio
  async def test_removing_a_day_takes_it_off_the_count_and_last_cooked(self, client: AsyncClient) -> None:
    recipe_id = await _recipe(client)
    await client.put(f"/v1/recipes/{recipe_id}/cooks/2026-09-20")
    await client.put(f"/v1/recipes/{recipe_id}/cooks/2026-10-08")

    removed = await client.delete(f"/v1/recipes/{recipe_id}/cooks/2026-10-08")

    assert removed.status_code == 200
    assert (removed.json()["last_cooked_on"], removed.json()["cook_count"]) == ("2026-09-20", 1)
    assert (await client.delete(f"/v1/recipes/{recipe_id}/cooks/2026-10-08")).status_code == 404

  @pytest.mark.asyncio
  async def test_history_lists_every_day_latest_first(self, client: AsyncClient) -> None:
    recipe_id = await _recipe(client)
    for day in ("2026-09-20", "2026-10-08", "2026-08-01"):
      await client.put(f"/v1/recipes/{recipe_id}/cooks/{day}")

    history = await client.get(f"/v1/recipes/{recipe_id}/cooks")

    assert history.json() == {"days": ["2026-10-08", "2026-09-20", "2026-08-01"]}

  @pytest.mark.asyncio
  async def test_the_list_says_when_each_recipe_was_last_cooked(self, client: AsyncClient) -> None:
    cooked = await _recipe(client, "Carbonara")
    await _recipe(client, "Dal")
    await client.put(f"/v1/recipes/{cooked}/cooks/2026-10-08")

    items = {r["title"]: (r["last_cooked_on"], r["cook_count"]) for r in (await client.get("/v1/recipes")).json()["items"]}

    assert items == {"Carbonara": ("2026-10-08", 1), "Dal": (None, 0)}

  @pytest.mark.asyncio
  async def test_a_day_no_time_zone_has_reached_is_refused(self, client: AsyncClient, mocker: MockerFixture) -> None:
    mocker.patch("api.recipes.service.utc_now", return_value=datetime(2026, 10, 8, 23, 30, tzinfo=UTC))
    recipe_id = await _recipe(client)

    tomorrow = await client.put(f"/v1/recipes/{recipe_id}/cooks/2026-10-09")
    after = await client.put(f"/v1/recipes/{recipe_id}/cooks/2026-10-10")

    assert tomorrow.status_code == 200, "Already the 9th east of UTC"
    assert after.status_code == 400
    assert (await client.get(f"/v1/recipes/{recipe_id}")).json()["cook_count"] == 1
