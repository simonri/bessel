"""The structured shape of a recipe, and conversion to and from markdown.

Recipes used to be one markdown document. The structure keeps what those
documents actually contained — ingredient groups, steps with titles, times
and tips, extra sections — as data, while free text fields (step text, tips,
sections) still allow light markdown.
"""

import re
from fractions import Fraction
from typing import Literal

from pydantic import Field

from api.common.schemas import Schema


class RecipeIngredient(Schema):
  amount: float | None = Field(default=None, ge=0, description="Quantity, e.g. 1.5 for 1½.")
  unit: str | None = Field(default=None, max_length=30)
  name: str = Field(min_length=1, max_length=300)
  note: str | None = Field(default=None, max_length=500, description="Preparation or alternatives, e.g. 'grovhackade'.")


class RecipeIngredientGroup(Schema):
  title: str | None = Field(default=None, max_length=200)
  items: list[RecipeIngredient] = Field(default_factory=list, max_length=100)


class RecipeCallout(Schema):
  kind: Literal["tip", "warning"] = "tip"
  label: str | None = Field(default=None, max_length=100, description="e.g. 'Proffstips'.")
  text: str = Field(max_length=2000)


class RecipeStep(Schema):
  title: str | None = Field(default=None, max_length=200)
  text: str = Field(default="", max_length=5000, description="Markdown.")
  time_label: str | None = Field(default=None, max_length=100, description="e.g. '5 min + 30 min i kyl'.")
  timer_minutes: int | None = Field(default=None, ge=1, le=1440)
  callouts: list[RecipeCallout] = Field(default_factory=list, max_length=10)


class RecipeSection(Schema):
  title: str = Field(max_length=200)
  text: str = Field(default="", max_length=10000, description="Markdown.")


class RecipeBody(Schema):
  intro: str | None = Field(default=None, max_length=2000)
  yield_text: str | None = Field(default=None, max_length=200, description="e.g. '3 burgare (6 puckar à ca 85 g)'.")
  total_minutes: int | None = Field(default=None, ge=1, le=10080)
  active_minutes: int | None = Field(default=None, ge=1, le=10080)
  ingredient_groups: list[RecipeIngredientGroup] = Field(default_factory=list, max_length=30)
  steps: list[RecipeStep] = Field(default_factory=list, max_length=100)
  sections: list[RecipeSection] = Field(default_factory=list, max_length=20)


# --- amounts -----------------------------------------------------------------

_UNICODE_FRACTIONS = {"½": Fraction(1, 2), "¼": Fraction(1, 4), "¾": Fraction(3, 4), "⅓": Fraction(1, 3), "⅔": Fraction(2, 3)}
_AMOUNT_RE = re.compile(r"^(\d+(?:[.,]\d+)?)?\s*([½¼¾⅓⅔])?(?=\s|$)")
_UNITS = frozenset(
  {
    "dl", "cl", "ml", "l", "msk", "tsk", "krm", "g", "kg", "hg", "st", "skiva", "skivor", "nypa", "nypor",
    "burk", "burkar", "paket", "förp", "klyfta", "klyftor", "kvist", "kvistar", "knippe", "påse",
    "tbsp", "tsp", "cup", "cups", "oz", "lb",
  }
)  # fmt: skip


def _parse_amount(text: str) -> tuple[float | None, str]:
  match = _AMOUNT_RE.match(text)
  if not match or not (match.group(1) or match.group(2)):
    return None, text
  value = Fraction(0)
  if match.group(1):
    value += Fraction(match.group(1).replace(",", "."))
  if match.group(2):
    value += _UNICODE_FRACTIONS[match.group(2)]
  return float(value), text[match.end() :].strip()


def format_amount(amount: float) -> str:
  whole = int(amount)
  fraction = Fraction(amount - whole).limit_denominator(4)
  glyph = {Fraction(1, 2): "½", Fraction(1, 4): "¼", Fraction(3, 4): "¾"}.get(fraction)
  if glyph:
    return f"{whole}{glyph}" if whole else glyph
  return f"{amount:g}"


def parse_ingredient_line(line: str) -> RecipeIngredient:
  """'0.5 dl cashewnötter, grovhackade' → amount 0.5, unit dl, name, note."""
  text = line.strip()
  amount, rest = _parse_amount(text)
  unit = None
  if amount is not None:
    first, _, remainder = rest.partition(" ")
    if first.lower().rstrip(".") in _UNITS and remainder:
      unit, rest = first, remainder.strip()
  else:
    rest = text
  note = None
  paren = re.search(r"\s*\(([^)]*)\)\s*$", rest)
  if paren:
    note, rest = paren.group(1).strip(), rest[: paren.start()].strip()
  name, sep, after = rest.partition(", ")
  if sep:
    note = f"{after.strip()}; {note}" if note else after.strip()
  return RecipeIngredient(amount=amount, unit=unit, name=name.strip() or text, note=note or None)


def format_ingredient(item: RecipeIngredient) -> str:
  parts = [format_amount(item.amount) if item.amount is not None else None, item.unit, item.name]
  line = " ".join(p for p in parts if p)
  return f"{line}, {item.note}" if item.note else line


# --- markdown → body -----------------------------------------------------------

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
_LIST_RE = re.compile(r"^\s*[-*]\s+(.*)$")
_BOLD_LABEL_RE = re.compile(r"^\*\*(.+?):?\*\*:?$")
_TIME_RE = re.compile(r"\s*\*\(([^)]*)\)\*\s*$")
_STEP_NUMBER_RE = re.compile(r"^\d+[.)]\s+")
_CALLOUT_RE = re.compile(r"^>\s*(?:\*\*(.+?):?\*\*:?\s*)?(.*)$")
_INGREDIENTS_RE = re.compile(r"^(ingrediens|ingredient)", re.IGNORECASE)
_STEPS_RE = re.compile(r"^(gör så här|så gör du|instruktion|tillagning|method|instructions|directions)", re.IGNORECASE)
_WARNING_RE = re.compile(r"misstag|varning|undvik|mistake|warning|avoid", re.IGNORECASE)
_META_RE = re.compile(r"\*\*([^*]+?):\*\*\s*([^·]+)")


def _minutes(text: str) -> int | None:
  hours = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:h\b|tim)", text)
  mins = re.search(r"(\d+)\s*min", text)
  total = 0.0
  if hours:
    total += float(hours.group(1).replace(",", ".")) * 60
  elif re.search(r"\b(en|1)\s+timme\b", text):
    total += 60
  if mins:
    total += int(mins.group(1))
  return round(total) or None


def _first_minutes(text: str) -> int | None:
  match = re.search(r"(\d+)(?:\s*[–-]\s*\d+)?\s*min", text)
  return int(match.group(1)) if match else None


def _append_line(text: str, line: str) -> str:
  if not text:
    return line
  return text + line if text.endswith("\n") else f"{text}\n{line}"


def _paragraph_break(text: str) -> str:
  return text + "\n\n" if text and not text.endswith("\n") else text


def parse_markdown(content: str) -> RecipeBody:
  """Best-effort conversion of a markdown recipe into the structured shape."""
  body = RecipeBody()
  mode: Literal["intro", "ingredients", "steps", "section"] = "intro"
  group: RecipeIngredientGroup | None = None
  step: RecipeStep | None = None
  section: RecipeSection | None = None
  intro: list[str] = []

  def new_group(title: str | None) -> RecipeIngredientGroup:
    created = RecipeIngredientGroup(title=title)
    body.ingredient_groups.append(created)
    return created

  for raw in content.splitlines():
    stripped = raw.strip()
    if stripped in ("", "---", "***"):
      # A blank line ends a paragraph inside a titled step or section.
      if step is not None and step.title:
        step.text = _paragraph_break(step.text)
      if section is not None:
        section.text = _paragraph_break(section.text)
      continue

    heading = _HEADING_RE.match(stripped)
    if heading:
      level, title = len(heading.group(1)), heading.group(2).strip()
      time = _TIME_RE.search(title)
      clean = _TIME_RE.sub("", title).strip().rstrip(":").strip()
      if _INGREDIENTS_RE.match(clean):
        mode, group, step, section = "ingredients", None, None, None
      elif _STEPS_RE.match(clean):
        mode, group, step, section = "steps", None, None, None
      elif mode == "ingredients" and level >= 3:
        group = new_group(clean)
      elif mode == "steps" and _STEP_NUMBER_RE.match(clean):
        label = time.group(1).strip() if time else None
        step = RecipeStep(
          title=_STEP_NUMBER_RE.sub("", clean).strip(),
          time_label=label,
          timer_minutes=_first_minutes(label) if label else None,
        )
        body.steps.append(step)
      else:
        mode, group, step = "section", None, None
        section = RecipeSection(title=clean)
        body.sections.append(section)
      continue

    if mode == "intro":
      meta = _META_RE.findall(stripped)
      if meta:
        for key, value in meta:
          key_l, value = key.lower(), value.strip()
          if key_l.startswith(("antal", "portioner", "ger", "serves", "yield")):
            body.yield_text = value
          elif "aktiv" in key_l or "active" in key_l:
            body.active_minutes = _minutes(value)
          elif "tid" in key_l or "time" in key_l:
            body.total_minutes = _minutes(value)
        continue
      intro.append(stripped)
      continue

    if mode == "ingredients":
      label = _BOLD_LABEL_RE.match(stripped)
      item = _LIST_RE.match(stripped)
      if label or (stripped.endswith(":") and not item):
        group = new_group((label.group(1) if label else stripped).rstrip(":").strip())
      elif item:
        if group is None:
          group = new_group(None)
        group.items.append(parse_ingredient_line(item.group(1)))
      continue

    if mode == "steps":
      if stripped.startswith(">"):
        callout = _CALLOUT_RE.match(stripped)
        target = step or (body.steps[-1] if body.steps else None)
        if callout and target is not None:
          label = callout.group(1)
          kind: Literal["tip", "warning"] = "warning" if label and _WARNING_RE.search(label) else "tip"
          target.callouts.append(RecipeCallout(kind=kind, label=label, text=callout.group(2).strip()))
        continue
      item = _LIST_RE.match(stripped)
      if step is None or not step.title:
        # Untitled steps are one list item (or line) each.
        step = RecipeStep(text=item.group(1) if item else stripped)
        body.steps.append(step)
        continue
      step.text = _append_line(step.text, stripped)
      continue

    if section is not None:
      section.text = _append_line(section.text, stripped)

  body.intro = "\n".join(intro).strip() or None
  for s in body.steps:
    s.text = s.text.strip()
  for sec in body.sections:
    sec.text = sec.text.strip()
  body.ingredient_groups = [g for g in body.ingredient_groups if g.items]
  return body


# --- body → markdown -----------------------------------------------------------


def _format_duration(minutes: int) -> str:
  hours, mins = divmod(minutes, 60)
  if hours and mins:
    return f"{hours} h {mins} min"
  return f"{hours} h" if hours else f"{mins} min"


def render_markdown(body: RecipeBody) -> str:
  """Markdown version of a structured recipe, for clients that only read `content`."""
  out: list[str] = []
  meta = []
  if body.yield_text:
    meta.append(f"**Antal:** {body.yield_text}")
  if body.total_minutes:
    meta.append(f"**Total tid:** {_format_duration(body.total_minutes)}")
  if body.active_minutes:
    meta.append(f"**Aktiv tid:** {_format_duration(body.active_minutes)}")
  if meta:
    out += [" · ".join(meta), ""]
  if body.intro:
    out += [body.intro, ""]
  if body.ingredient_groups:
    out += ["## Ingredienser", ""]
    for group in body.ingredient_groups:
      if group.title:
        out.append(f"### {group.title}")
      out += [f"- {format_ingredient(item)}" for item in group.items]
      out.append("")
  if body.steps:
    out += ["## Gör så här", ""]
    titled = any(s.title for s in body.steps)
    for i, step in enumerate(body.steps, 1):
      if titled:
        heading = f"### {i}. {step.title or ''}".rstrip()
        out.append(f"{heading} *({step.time_label})*" if step.time_label else heading)
        if step.text:
          out.append(step.text)
      else:
        out.append(f"- {step.text}")
      for callout in step.callouts:
        out.append(f"> **{callout.label}:** {callout.text}" if callout.label else f"> {callout.text}")
      if titled:
        out.append("")
    out.append("")
  for section in body.sections:
    out += [f"## {section.title}", "", section.text, ""]
  return "\n".join(out).strip() + "\n"
