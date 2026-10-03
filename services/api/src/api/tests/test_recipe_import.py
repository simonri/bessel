import json
from typing import Any

import httpx
import pytest
from api import openrouter
from api.recipes.importer import MAX_INPUT_CHARS
from api.settings import settings
from httpx import AsyncClient

RECIPE: dict[str, Any] = {
  "title": "Pannkakor",
  "recipe_type": "other",
  "intro": None,
  "yield_text": "4 portioner",
  "total_minutes": 0,
  "active_minutes": None,
  "ingredient_groups": [
    {
      "title": None,
      "items": [
        {"amount": 2.5, "unit": "dl", "name": "vetemjöl", "note": None},
        {"amount": None, "unit": "", "name": "salt", "note": "  "},
        {"amount": 1, "unit": None, "name": " ", "note": None},
      ],
    },
    {"title": "Tom", "items": []},
  ],
  "steps": [
    {"title": None, "text": "Vispa ihop allt.", "time_label": None, "timer_minutes": None, "callouts": []},
    {
      "title": None,
      "text": "Stek i smör.",
      "time_label": "2 min per sida",
      "timer_minutes": 0,
      "callouts": [{"kind": "tip", "label": None, "text": "Låt smeten vila."}],
    },
    {"title": "", "text": "", "time_label": None, "timer_minutes": None, "callouts": []},
  ],
  "sections": [],
}


def _completion(content: str, finish_reason: str = "stop") -> httpx.Response:
  return httpx.Response(200, json={"choices": [{"message": {"content": content}, "finish_reason": finish_reason}]})


class FakeOpenRouter:
  def __init__(self) -> None:
    self.responses: list[httpx.Response] = []
    self.requests: list[dict[str, Any]] = []

  def answer(self, payload: dict[str, Any]) -> None:
    self.responses.append(_completion(json.dumps(payload)))

  def handler(self, request: httpx.Request) -> httpx.Response:
    self.requests.append(json.loads(request.content))
    return self.responses.pop(0)


@pytest.fixture
def llm(monkeypatch: pytest.MonkeyPatch) -> FakeOpenRouter:
  fake = FakeOpenRouter()
  monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "test-key")
  monkeypatch.setattr(openrouter, "client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)))
  return fake


class TestRecipeImport:
  @pytest.mark.asyncio
  async def test_returns_cleaned_structure(self, client: AsyncClient, llm: FakeOpenRouter) -> None:
    llm.answer({"status": "ok", "error": None, "recipe": RECIPE})

    resp = await client.post("/v1/recipes/import", json={"text": "Pannkakor: 2½ dl mjöl, salt. Vispa, stek."})

    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Pannkakor"
    assert data["recipe_type"] == "other"
    body = data["body"]
    assert body["total_minutes"] is None
    assert body["ingredient_groups"] == [
      {
        "title": None,
        "items": [
          {"amount": 2.5, "unit": "dl", "name": "vetemjöl", "note": None},
          {"amount": None, "unit": None, "name": "salt", "note": None},
        ],
      }
    ]
    assert [s["text"] for s in body["steps"]] == ["Vispa ihop allt.", "Stek i smör."]
    assert body["steps"][1]["timer_minutes"] is None
    assert body["steps"][1]["callouts"] == [{"kind": "tip", "label": None, "text": "Låt smeten vila."}]

  @pytest.mark.asyncio
  async def test_requests_strict_schema(self, client: AsyncClient, llm: FakeOpenRouter) -> None:
    llm.answer({"status": "ok", "error": None, "recipe": RECIPE})

    await client.post("/v1/recipes/import", json={"text": "Pannkakor"})

    request = llm.requests[0]
    assert request["model"] == settings.RECIPE_IMPORT_MODEL
    assert request["response_format"]["json_schema"]["strict"] is True
    assert request["provider"] == {"require_parameters": True}
    assert request["messages"][1] == {"role": "user", "content": "Pannkakor"}

  @pytest.mark.asyncio
  async def test_not_a_recipe(self, client: AsyncClient, llm: FakeOpenRouter) -> None:
    llm.answer({"status": "error", "error": "This is a shopping list, not a recipe.", "recipe": None})

    resp = await client.post("/v1/recipes/import", json={"text": "mjölk, bröd"})

    assert resp.status_code == 422
    assert resp.json() == {"error": "RecipeImportError", "detail": "This is a shopping list, not a recipe."}

  @pytest.mark.asyncio
  async def test_recipe_without_ingredients_or_steps(self, client: AsyncClient, llm: FakeOpenRouter) -> None:
    llm.answer({"status": "ok", "error": None, "recipe": {**RECIPE, "ingredient_groups": [], "steps": []}})

    resp = await client.post("/v1/recipes/import", json={"text": "Pannkakor"})

    assert resp.status_code == 422
    assert resp.json()["error"] == "RecipeImportError"

  @pytest.mark.asyncio
  async def test_retries_once_after_bad_output(self, client: AsyncClient, llm: FakeOpenRouter) -> None:
    llm.responses.append(_completion("not json"))
    llm.answer({"status": "ok", "error": None, "recipe": RECIPE})

    resp = await client.post("/v1/recipes/import", json={"text": "Pannkakor"})

    assert resp.status_code == 200
    assert len(llm.requests) == 2

  @pytest.mark.asyncio
  async def test_gives_up_after_two_bad_outputs(self, client: AsyncClient, llm: FakeOpenRouter) -> None:
    llm.responses.append(_completion("{\"status\": \"ok\"", finish_reason="length"))
    llm.responses.append(_completion("[]"))

    resp = await client.post("/v1/recipes/import", json={"text": "Pannkakor"})

    assert resp.status_code == 422
    assert resp.json()["error"] == "RecipeImportError"
    assert len(llm.requests) == 2

  @pytest.mark.asyncio
  async def test_upstream_failure(self, client: AsyncClient, llm: FakeOpenRouter) -> None:
    llm.responses.append(httpx.Response(429, json={"error": {"message": "rate limited"}}))

    resp = await client.post("/v1/recipes/import", json={"text": "Pannkakor"})

    assert resp.status_code == 502
    assert resp.json()["error"] == "LLMUnavailableError"

  @pytest.mark.asyncio
  async def test_not_configured(self, client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "")

    resp = await client.post("/v1/recipes/import", json={"text": "Pannkakor"})

    assert resp.status_code == 503

  @pytest.mark.asyncio
  @pytest.mark.parametrize("text", ["   ", "x" * (MAX_INPUT_CHARS + 1)])
  async def test_rejects_empty_or_huge_text(self, client: AsyncClient, llm: FakeOpenRouter, text: str) -> None:
    resp = await client.post("/v1/recipes/import", json={"text": text})

    assert resp.status_code == 422
    assert llm.requests == []


class TestRecipeStructuredFlag:
  @pytest.mark.asyncio
  async def test_markdown_recipe_is_not_structured(self, client: AsyncClient) -> None:
    resp = await client.post("/v1/recipes", json={"title": "Gröt", "content": "## Ingredienser\n- 1 dl havregryn"})

    assert resp.json()["structured"] is False

  @pytest.mark.asyncio
  async def test_saved_body_is_structured(self, client: AsyncClient) -> None:
    body = {"ingredient_groups": [{"items": [{"amount": 1, "unit": "dl", "name": "havregryn"}]}]}
    resp = await client.post("/v1/recipes", json={"title": "Gröt", "body": body})

    assert resp.json()["structured"] is True
