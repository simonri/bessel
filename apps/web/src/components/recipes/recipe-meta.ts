import type { RecipeBody, RecipeSchema } from "@bessel/client";

const FRACTION_GLYPHS: [number, string][] = [
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [1 / 2, "½"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
];

/** 1.5 → "1½", 0.75 → "¾", 2 → "2", 2.4 → "2.4". */
export function formatAmount(amount: number): string {
  const whole = Math.floor(amount);
  const rest = amount - whole;
  if (rest < 0.01) return String(whole);
  const glyph = FRACTION_GLYPHS.find(([v]) => Math.abs(v - rest) < 0.02)?.[1];
  if (glyph) return whole ? `${whole}${glyph}` : glyph;
  return String(Math.round(amount * 100) / 100);
}

/** 60 → "1 h", 45 → "45 min", 75 → "1 h 15 min". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} h ${m} min`;
  return h ? `${h} h` : `${m} min`;
}

export function summarizeRecipe(body: RecipeBody): {
  ingredients: number;
  steps: number;
  minutes: number | null;
} {
  const ingredients = (body.ingredient_groups ?? []).reduce(
    (sum, g) => sum + (g.items?.length ?? 0),
    0,
  );
  return {
    ingredients,
    steps: body.steps?.length ?? 0,
    minutes: body.total_minutes ?? null,
  };
}

export function describeRecipe(body: RecipeBody): string | null {
  const { ingredients, steps, minutes } = summarizeRecipe(body);
  const parts = [
    ingredients
      ? `${ingredients} ingredient${ingredients === 1 ? "" : "s"}`
      : null,
    steps ? `${steps} step${steps === 1 ? "" : "s"}` : null,
    minutes ? formatMinutes(minutes) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" - ") : null;
}

/** Search across what someone would remember about a recipe: its name,
 *  intro and what goes into it. */
export function matchesRecipe(
  recipe: Pick<RecipeSchema, "title" | "body">,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const { body } = recipe;
  const haystack = [
    recipe.title,
    body.intro,
    ...(body.ingredient_groups ?? []).flatMap((g) => [
      g.title,
      ...(g.items ?? []).flatMap((i) => [i.name, i.note]),
    ]),
  ];
  return haystack.some((text) => text?.toLowerCase().includes(q));
}
