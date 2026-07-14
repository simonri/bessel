from uuid import uuid4

import pytest
from httpx import AsyncClient


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


class TestRecipeNotFound:
  @pytest.mark.asyncio
  async def test_get_missing_returns_404(self, client: AsyncClient) -> None:
    resp = await client.get(f"/v1/recipes/{uuid4()}")
    assert resp.status_code == 404

  @pytest.mark.asyncio
  async def test_update_missing_returns_404(self, client: AsyncClient) -> None:
    resp = await client.patch(f"/v1/recipes/{uuid4()}", json={"title": "Nope"})
    assert resp.status_code == 404

  @pytest.mark.asyncio
  async def test_delete_missing_returns_404(self, client: AsyncClient) -> None:
    resp = await client.delete(f"/v1/recipes/{uuid4()}")
    assert resp.status_code == 404
