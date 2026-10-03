import pytest
from api.models.recipe import Recipe
from api.postgres import AsyncSession
from api.recipes.body import RecipeBody, RecipeIngredient, RecipeStep, format_amount, parse_ingredient_line, parse_markdown, render_markdown
from api.tests.fixtures.database import SaveFixture
from httpx import AsyncClient
from sqlalchemy import select

GRANOLA = """## Ingredienser
**Torrt:**

- 5 dl havregryn
- 0.5 dl cashewnötter, grovhackade

**Vått & sött:**

- 5 msk honung (eller lönnsirap)
- 1 krm salt

## Gör så här

- Sätt ugnen på 150°C.
- Rosta i 25–30 minuter.
"""

GRANOLA_WITH_INTRO = """Krispig hemmagjord müsli. Räcker till ca 10 portioner.

### Ingredienser

Torrt:

- 1½ dl mandlar, grovhackade
- Finrivet skal från ½ apelsin

### Aromater & kryddor:
- ¾ tsk flingsalt

### Gör så här
- Blanda allt.
"""

BURGER = """**Antal:** 3 burgare (6 puckar à ca 85 g) · **Total tid:** ca 1 timme · **Aktiv tid vid pannan:** 10 min

---

## Ingredienser

### Puckarna
- 500 g nötfärs, 20 % fetthalt (gärna högrev)
- 2 gula lökar

## Gör så här

### 1. Gör burgardressingen *(5 min + 30 min i kyl)*
Blanda allt. Ställ i kylen.
> **Proffstips:** En extra droppe gurklag.

### 2. Hetta upp pannan *(5 min)*
Högsta värme.
> **Vanligaste misstaget:** för sval panna.

### 3. Bygg burgaren
1. Bottenbröd
2. Lock på

Servera **omedelbart**.

---

## Varianter

- **Oklahoma onions:** tunt skivad lök.
"""


class TestIngredientLines:
  @pytest.mark.parametrize(
    ("line", "expected"),
    [
      ("5 dl havregryn", RecipeIngredient(amount=5, unit="dl", name="havregryn")),
      ("0.5 dl cashewnötter, grovhackade", RecipeIngredient(amount=0.5, unit="dl", name="cashewnötter", note="grovhackade")),
      ("1½ dl mandlar", RecipeIngredient(amount=1.5, unit="dl", name="mandlar")),
      ("¾ tsk flingsalt", RecipeIngredient(amount=0.75, unit="tsk", name="flingsalt")),
      ("5 msk honung (eller lönnsirap)", RecipeIngredient(amount=5, unit="msk", name="honung", note="eller lönnsirap")),
      ("2 gula lökar", RecipeIngredient(amount=2, name="gula lökar")),
      ("Finrivet skal från ½ apelsin", RecipeIngredient(name="Finrivet skal från ½ apelsin")),
      (
        "500 g nötfärs, 20 % fetthalt (gärna högrev)",
        RecipeIngredient(amount=500, unit="g", name="nötfärs", note="20 % fetthalt; gärna högrev"),
      ),
    ],
  )
  def test_parses(self, line: str, expected: RecipeIngredient) -> None:
    assert parse_ingredient_line(line) == expected

  @pytest.mark.parametrize(("amount", "text"), [(0.5, "½"), (1.5, "1½"), (0.75, "¾"), (5, "5"), (2.4, "2.4")])
  def test_formats_amounts(self, amount: float, text: str) -> None:
    assert format_amount(amount) == text


class TestParseMarkdown:
  def test_ingredient_groups_from_bold_labels_and_plain_steps(self) -> None:
    body = parse_markdown(GRANOLA)

    assert [g.title for g in body.ingredient_groups] == ["Torrt", "Vått & sött"]
    assert [i.name for i in body.ingredient_groups[0].items] == ["havregryn", "cashewnötter"]
    assert [s.text for s in body.steps] == ["Sätt ugnen på 150°C.", "Rosta i 25–30 minuter."]
    assert all(s.title is None for s in body.steps)

  def test_intro_plain_group_labels_and_headings(self) -> None:
    body = parse_markdown(GRANOLA_WITH_INTRO)

    assert body.intro == "Krispig hemmagjord müsli. Räcker till ca 10 portioner."
    assert [g.title for g in body.ingredient_groups] == ["Torrt", "Aromater & kryddor"]
    assert body.ingredient_groups[0].items[0] == RecipeIngredient(amount=1.5, unit="dl", name="mandlar", note="grovhackade")
    assert [s.text for s in body.steps] == ["Blanda allt."]

  def test_titled_steps_with_times_tips_and_sections(self) -> None:
    body = parse_markdown(BURGER)

    assert body.yield_text == "3 burgare (6 puckar à ca 85 g)"
    assert (body.total_minutes, body.active_minutes) == (60, 10)
    assert body.ingredient_groups[0].title == "Puckarna"

    dressing, pan, build = body.steps
    assert (dressing.title, dressing.time_label) == ("Gör burgardressingen", "5 min + 30 min i kyl")
    assert dressing.text == "Blanda allt. Ställ i kylen."
    assert [(c.kind, c.label, c.text) for c in dressing.callouts] == [("tip", "Proffstips", "En extra droppe gurklag.")]
    assert [(c.kind, c.label) for c in pan.callouts] == [("warning", "Vanligaste misstaget")]
    assert build.text == "1. Bottenbröd\n2. Lock på\n\nServera **omedelbart**."

    assert [(s.title, s.text) for s in body.sections] == [("Varianter", "- **Oklahoma onions:** tunt skivad lök.")]

  @pytest.mark.parametrize("markdown", [GRANOLA, GRANOLA_WITH_INTRO, BURGER])
  def test_render_round_trips(self, markdown: str) -> None:
    body = parse_markdown(markdown)
    assert parse_markdown(render_markdown(body)) == body


SIMPLE_BODY = RecipeBody(
  intro="Snabb lunch.",
  total_minutes=15,
  ingredient_groups=[{"items": [{"amount": 2, "unit": "st", "name": "ägg"}]}],  # type: ignore[list-item]
  steps=[RecipeStep(title="Koka", text="Koka äggen.", time_label="8 min")],
)


class TestRecipeBodyApi:
  @pytest.mark.asyncio
  async def test_create_with_body_mirrors_it_as_markdown(self, client: AsyncClient) -> None:
    resp = await client.post("/v1/recipes", json={"title": "Ägg", "body": SIMPLE_BODY.model_dump(mode="json")})

    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert RecipeBody.model_validate(data["body"]) == SIMPLE_BODY
    assert "- 2 st ägg" in data["content"]
    assert "### 1. Koka *(8 min)*" in data["content"]

  @pytest.mark.asyncio
  async def test_markdown_only_recipe_is_read_as_structure(self, client: AsyncClient, save_fixture: SaveFixture, session: AsyncSession) -> None:
    me = (await client.get("/v1/auth/me")).json()
    await save_fixture(Recipe(title="Müsli", content=GRANOLA, recipe_type="other", user_id=me["id"]))

    listed = (await client.get("/v1/recipes")).json()["items"]

    assert [g["title"] for g in listed[0]["body"]["ingredient_groups"]] == ["Torrt", "Vått & sött"]
    stored = (await session.execute(select(Recipe))).scalar_one()
    assert stored.body is None

  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_markdown_edit_from_an_older_client_replaces_the_structure(self, client: AsyncClient) -> None:
    created = (await client.post("/v1/recipes", json={"title": "Ägg", "body": SIMPLE_BODY.model_dump(mode="json")})).json()

    resp = await client.patch(f"/v1/recipes/{created['id']}", json={"content": GRANOLA})

    assert resp.status_code == 200
    assert [g["title"] for g in resp.json()["body"]["ingredient_groups"]] == ["Torrt", "Vått & sött"]

  @pytest.mark.asyncio
  async def test_rejects_an_ingredient_without_a_name(self, client: AsyncClient) -> None:
    body = {"ingredient_groups": [{"items": [{"amount": 1, "unit": "dl", "name": ""}]}]}
    resp = await client.post("/v1/recipes", json={"title": "Bad", "body": body})
    assert resp.status_code == 422
