import pytest
from api.models.recipe import Recipe
from api.tests.fixtures.database import SaveFixture
from api.tests.fixtures.mcp import ConnectFixture, mcp_call, mcp_call_error


class TestRecipes:
  @pytest.mark.asyncio
  async def test_search_and_get(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    pancakes = Recipe(title="Pancakes", content="- 2 eggs\n- 3 dl milk\n\n1. Whisk.")
    await save_owned(pancakes)
    await save_owned(Recipe(title="Lasagna", content="", recipe_type="main"))

    found = await mcp_call(connect, "search_recipes", {"search": "pan"})
    assert found["total_count"] == 1
    assert found["recipes"] == [{"id": str(pancakes.id), "title": "Pancakes", "recipe_type": "other"}]

    recipe = await mcp_call(connect, "get_recipe", {"recipe_id": str(pancakes.id)})
    assert recipe["title"] == "Pancakes"
    assert "2 eggs" in recipe["content"]

  @pytest.mark.asyncio
  async def test_other_user_cannot_see_recipes(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    recipe = Recipe(title="Secret sauce", content="")
    await save_owned(recipe)

    assert (await mcp_call(connect, "search_recipes", token="token-b"))["recipes"] == []
    assert await mcp_call_error(connect, "get_recipe", {"recipe_id": str(recipe.id)}, token="token-b") == "Recipe not found."
