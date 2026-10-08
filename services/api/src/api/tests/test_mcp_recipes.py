from typing import Any

import pytest
from api.models.recipe import Recipe
from api.recipes.body import RecipeBody, RecipeIngredient, RecipeIngredientGroup, RecipeStep
from api.tests.fixtures.database import SaveFixture
from api.tests.fixtures.mcp import ConnectFixture, mcp_call, mcp_call_error


def structured(*ingredient_names: str, step: str = "Cook.") -> dict[str, Any]:
  items = [RecipeIngredient(name=name) for name in ingredient_names]
  return RecipeBody(ingredient_groups=[RecipeIngredientGroup(items=items)], steps=[RecipeStep(text=step)]).model_dump(mode="json")


def new_recipe(title: str = "Weeknight dal", **overrides: Any) -> dict[str, Any]:
  return {
    "title": title,
    "recipe_type": "main",
    "yield_text": "4 servings",
    "total_minutes": 40,
    "ingredient_groups": [
      {"lines": ["2 dl red lentils", "1 onion (finely chopped)", ""]},
      {"title": "Tadka", "lines": ["2 msk butter", "1 tsk cumin seeds, whole"]},
    ],
    "steps": [{"text": "Simmer the lentils.", "time_label": "25 min"}, {"text": "Fry the spices and pour over."}],
    **overrides,
  }


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


class TestSearchRecipesByIngredient:
  @pytest.mark.asyncio
  async def test_matches_all_ingredients_case_insensitively(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    tart = Recipe(title="Leek tart", content="", body=structured("Leeks", "Feta cheese"))
    legacy = Recipe(title="Old pie", content="## Ingredienser\n- 2 LEEKS\n- 150 g feta")
    await save_owned(tart)
    await save_owned(legacy)
    await save_owned(Recipe(title="Leek soup", content="", body=structured("Leeks", "Potatoes")))
    # Mentioned only in a step: not an ingredient of a structured recipe.
    await save_owned(Recipe(title="Salad", content="", body=structured("Leeks", step="Crumble feta on top.")))

    found = await mcp_call(connect, "search_recipes", {"ingredients": ["leek", " FETA "]})

    assert [r["id"] for r in found["recipes"]] == [str(tart.id), str(legacy.id)]

  @pytest.mark.asyncio
  async def test_combines_with_title_search(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    await save_owned(Recipe(title="Leek tart", content="", body=structured("leeks")))
    soup = Recipe(title="Leek soup", content="", body=structured("leeks"))
    await save_owned(soup)

    found = await mcp_call(connect, "search_recipes", {"search": "soup", "ingredients": ["leek"]})

    assert found["recipes"] == [{"id": str(soup.id), "title": "Leek soup", "recipe_type": "other"}]

  @pytest.mark.asyncio
  async def test_wildcards_are_literal(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    await save_owned(Recipe(title="Leek tart", content="", body=structured("leeks")))

    assert (await mcp_call(connect, "search_recipes", {"ingredients": ["l%k"]}))["recipes"] == []

  @pytest.mark.asyncio
  async def test_other_user_cannot_see_recipes(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    await save_owned(Recipe(title="Leek tart", content="", body=structured("leeks")))

    found = await mcp_call(connect, "search_recipes", {"ingredients": ["leek"]}, token="token-b")

    assert found == {"total_count": 0, "recipes": []}


class TestAddRecipe:
  @pytest.mark.asyncio
  async def test_saves_parsed_ingredients(self, connect: ConnectFixture) -> None:
    added = await mcp_call(connect, "add_recipe", new_recipe())

    assert added["title"] == "Weeknight dal"
    assert added["ingredient_count"] == 4

    recipe = await mcp_call(connect, "get_recipe", {"recipe_id": added["id"]})
    assert recipe["recipe_type"] == "main"
    assert recipe["structured"] is True
    body = recipe["body"]
    assert body["yield_text"] == "4 servings"
    assert body["total_minutes"] == 40
    lentils, onion = body["ingredient_groups"][0]["items"]
    assert lentils == {"amount": 2.0, "unit": "dl", "name": "red lentils", "note": None}
    assert onion == {"amount": 1.0, "unit": None, "name": "onion", "note": "finely chopped"}
    tadka = body["ingredient_groups"][1]
    assert tadka["title"] == "Tadka"
    assert tadka["items"][1] == {"amount": 1.0, "unit": "tsk", "name": "cumin seeds", "note": "whole"}
    assert body["steps"][0]["time_label"] == "25 min"
    assert "- 2 dl red lentils" in recipe["content"]

  @pytest.mark.asyncio
  @pytest.mark.parametrize(("saved", "added"), [("Weeknight Dal", " weeknight dal "), ("Äppelpaj", "äppelpaj")])
  async def test_refuses_duplicate_title(self, connect: ConnectFixture, save_owned: SaveFixture, saved: str, added: str) -> None:
    existing = Recipe(title=saved, content="")
    await save_owned(existing)

    message = await mcp_call_error(connect, "add_recipe", new_recipe(added))

    assert str(existing.id) in message
    assert "different recipe" in message
    assert (await mcp_call(connect, "search_recipes"))["total_count"] == 1

  @pytest.mark.asyncio
  @pytest.mark.parametrize(
    ("overrides", "expected"),
    [
      ({"title": "   "}, "The title can't be blank."),
      ({"total_minutes": 0}, "total_minutes"),
      ({"ingredient_groups": [{"lines": ["x" * 301]}]}, "Couldn't read the ingredient line"),
    ],
  )
  async def test_rejects_invalid_input(self, connect: ConnectFixture, overrides: dict[str, Any], expected: str) -> None:
    message = await mcp_call_error(connect, "add_recipe", new_recipe(**overrides))

    assert expected in message
    assert (await mcp_call(connect, "search_recipes"))["total_count"] == 0

  @pytest.mark.asyncio
  async def test_recipes_belong_to_the_caller(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    await save_owned(Recipe(title="Weeknight dal", content=""))

    added = await mcp_call(connect, "add_recipe", new_recipe(), token="token-b")

    assert [r["id"] for r in (await mcp_call(connect, "search_recipes", token="token-b"))["recipes"]] == [added["id"]]
    assert added["id"] not in [r["id"] for r in (await mcp_call(connect, "search_recipes"))["recipes"]]
    assert await mcp_call_error(connect, "get_recipe", {"recipe_id": added["id"]}) == "Recipe not found."
