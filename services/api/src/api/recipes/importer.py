"""Turn free-form recipe text (markdown, a pasted web page, notes) into a `RecipeBody` with an LLM."""

from typing import Any

import structlog
from pydantic import ValidationError

from api import openrouter
from api.exceptions import BesselError
from api.models.recipe import RecipeType
from api.recipes.body import RecipeBody
from api.recipes.schemas import RecipeImportResult
from api.settings import settings

log = structlog.get_logger()

MAX_INPUT_CHARS = 20_000
_ATTEMPTS = 2


class RecipeImportError(BesselError):
  """The text couldn't be turned into a recipe."""

  def __init__(self, message: str, status_code: int = 422) -> None:
    super().__init__(message, status_code)


def _nullable(schema: dict[str, Any]) -> dict[str, Any]:
  return {**schema, "type": [schema["type"], "null"]}


def _object(properties: dict[str, Any]) -> dict[str, Any]:
  return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}


_STRING = {"type": "string"}
_INTEGER = {"type": "integer"}

# Strict structured outputs want every property required, no $refs and no
# defaults, so this mirrors `RecipeBody` by hand instead of deriving it.
_RECIPE_SCHEMA = _object(
  {
    "title": _STRING,
    "recipe_type": {"type": "string", "enum": [t.value for t in RecipeType]},
    "intro": _nullable(_STRING),
    "yield_text": _nullable(_STRING),
    "total_minutes": _nullable(_INTEGER),
    "active_minutes": _nullable(_INTEGER),
    "ingredient_groups": {
      "type": "array",
      "items": _object(
        {
          "title": _nullable(_STRING),
          "items": {
            "type": "array",
            "items": _object(
              {
                "amount": _nullable({"type": "number"}),
                "unit": _nullable(_STRING),
                "name": _STRING,
                "note": _nullable(_STRING),
              }
            ),
          },
        }
      ),
    },
    "steps": {
      "type": "array",
      "items": _object(
        {
          "title": _nullable(_STRING),
          "text": _STRING,
          "time_label": _nullable(_STRING),
          "timer_minutes": _nullable(_INTEGER),
          "callouts": {
            "type": "array",
            "items": _object(
              {
                "kind": {"type": "string", "enum": ["tip", "warning"]},
                "label": _nullable(_STRING),
                "text": _STRING,
              }
            ),
          },
        }
      ),
    },
    "sections": {"type": "array", "items": _object({"title": _STRING, "text": _STRING})},
  }
)

RESPONSE_SCHEMA = _object(
  {
    "status": {"type": "string", "enum": ["ok", "error"]},
    "error": _nullable(_STRING),
    "recipe": {**_RECIPE_SCHEMA, "type": ["object", "null"]},
  }
)

SYSTEM_PROMPT = """\
You convert recipe text into structured JSON for a personal cookbook app. The input may be markdown, \
plain notes, or text copied from a recipe website (with menus, ads, comments and other noise).

Rules:
- Keep the recipe's original language. Never translate. Copy wording faithfully; only fix obvious typos.
- Never invent ingredients, amounts, steps, times or tips that are not in the text.
- Ignore website noise: navigation, ads, ratings, comments, author bios, "jump to recipe" links.
- title: the dish name. recipe_type: "dessert" for sweets, cakes, cookies and sweet drinks; \
"main" for lunch or dinner dishes; otherwise "other" (breakfast, sides, sauces, bread, snacks).
- intro: a short description if the text has one, else null.
- yield_text: servings or yield as written, e.g. "4 portioner" or "12 cookies".
- total_minutes / active_minutes: only if the text explicitly states a total or active/prep time, as \
whole minutes. Never add up or estimate step times; otherwise null.
- Ingredients: one item per ingredient. amount is a number (½ → 0.5, 1 ½ → 1.5, "2-3" → 2 and keep \
"2-3" in note); null when there is no amount ("salt", "a pinch"). unit exactly as written ("dl", "msk", \
"g", "cups"; count words like "st", "skivor", "nypa", "slices", "cloves" are units too), null when there \
is none. name is the ingredient itself; preparation or alternatives go \
in note ("finely chopped", "or butter").
- Group ingredients only if the text groups them (e.g. "Dough", "Filling"); otherwise one group with \
title null.
- Steps: one step per instruction in order. title is null unless the source itself gives the step a \
heading; never make titles up, and drop the step number ("### 3. Fry the onions" → "Fry the onions"). \
text may use light markdown. time_label is the step's duration as written, if any; timer_minutes is \
set only for a real wait or cooking time a timer helps with (bake 25 min → 25; for a range use the \
lower number: 25-30 min → 25), else null.
- Callouts: only text the source explicitly marks as a tip, note or warning (e.g. "Tips:", "Proffstips", \
"Note:", a blockquote, or a separate "don't skip this" remark) becomes a callout on its step: "warning" \
for mistakes to avoid, otherwise "tip". Keep the label if the text has one. Never turn an ordinary \
instruction into a callout.
- Anything else worth keeping (storage, variations, serving suggestions, notes) goes in sections.
- Every sentence goes in exactly one place: never repeat text between intro, steps, callouts and sections.

If the text is not a recipe, or is too incomplete to cook from (no ingredients and no steps), respond \
with status "error", recipe null, and error a short, friendly sentence in English saying what is \
missing. Otherwise respond with status "ok", error null, and the recipe."""


def _clean_text(value: Any, max_length: int) -> str | None:
  if not isinstance(value, str):
    return None
  text = value.strip()
  return text[:max_length] if text else None


def _positive_int(value: Any, maximum: int) -> int | None:
  if isinstance(value, bool) or not isinstance(value, int | float):
    return None
  minutes = round(value)
  return minutes if 1 <= minutes <= maximum else None


def _normalize(recipe: dict[str, Any]) -> dict[str, Any]:
  """Smooth over small slips (0 minutes, blank strings, overlong text) so they don't fail the import."""
  groups = []
  for group in recipe.get("ingredient_groups") or []:
    items = []
    for item in group.get("items") or []:
      name = _clean_text(item.get("name"), 300)
      if not name:
        continue
      amount = item.get("amount")
      items.append(
        {
          "amount": amount if isinstance(amount, int | float) and not isinstance(amount, bool) and amount >= 0 else None,
          "unit": _clean_text(item.get("unit"), 30),
          "name": name,
          "note": _clean_text(item.get("note"), 500),
        }
      )
    if items:
      groups.append({"title": _clean_text(group.get("title"), 200), "items": items[:100]})

  steps = []
  for step in recipe.get("steps") or []:
    callouts = [
      {
        "kind": c.get("kind") if c.get("kind") in ("tip", "warning") else "tip",
        "label": _clean_text(c.get("label"), 100),
        "text": _clean_text(c.get("text"), 2000),
      }
      for c in step.get("callouts") or []
      if _clean_text(c.get("text"), 2000)
    ]
    text = _clean_text(step.get("text"), 5000) or ""
    title = _clean_text(step.get("title"), 200)
    if not text and not title:
      continue
    steps.append(
      {
        "title": title,
        "text": text,
        "time_label": _clean_text(step.get("time_label"), 100),
        "timer_minutes": _positive_int(step.get("timer_minutes"), 1440),
        "callouts": callouts[:10],
      }
    )

  sections = [
    {"title": title, "text": _clean_text(s.get("text"), 10000) or ""} for s in recipe.get("sections") or [] if (title := _clean_text(s.get("title"), 200))
  ]

  return {
    "intro": _clean_text(recipe.get("intro"), 2000),
    "yield_text": _clean_text(recipe.get("yield_text"), 200),
    "total_minutes": _positive_int(recipe.get("total_minutes"), 10080),
    "active_minutes": _positive_int(recipe.get("active_minutes"), 10080),
    "ingredient_groups": groups[:30],
    "steps": steps[:100],
    "sections": sections[:20],
  }


def _to_result(answer: dict[str, Any]) -> RecipeImportResult:
  if answer.get("status") == "error" or not isinstance(answer.get("recipe"), dict):
    reason = _clean_text(answer.get("error"), 300) or "That doesn't look like a recipe."
    raise RecipeImportError(reason)

  recipe = answer["recipe"]
  body = RecipeBody.model_validate(_normalize(recipe))
  if not body.ingredient_groups and not body.steps:
    raise RecipeImportError("Couldn't find any ingredients or steps in that text.")
  recipe_type = recipe.get("recipe_type")
  return RecipeImportResult(
    title=_clean_text(recipe.get("title"), 500) or "",
    recipe_type=RecipeType(recipe_type) if recipe_type in RecipeType.__members__ else RecipeType.other,
    body=body,
  )


async def import_recipe(text: str) -> RecipeImportResult:
  text = text.strip()
  if not text:
    raise RecipeImportError("Paste a recipe first.")
  if len(text) > MAX_INPUT_CHARS:
    raise RecipeImportError("That's a lot of text - paste just the recipe part.")

  for attempt in range(1, _ATTEMPTS + 1):
    try:
      answer = await openrouter.complete_json(
        model=settings.RECIPE_IMPORT_MODEL,
        system=SYSTEM_PROMPT,
        user=text,
        schema_name="recipe_import",
        schema=RESPONSE_SCHEMA,
        max_tokens=8000,
      )
      return _to_result(answer)
    except (openrouter.LLMOutputError, ValidationError) as e:
      log.warning("recipes.import.bad_output", attempt=attempt, model=settings.RECIPE_IMPORT_MODEL, error=str(e))

  raise RecipeImportError("Couldn't make sense of that recipe. Try again, or tidy the text a little first.")
