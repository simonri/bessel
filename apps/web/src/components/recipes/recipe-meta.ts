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

/** The "yyyy-mm-dd" day the API sent: it decodes `date` fields to UTC midnight. */
export function apiDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The day a recipe was last cooked, or null when it never was. */
export function lastCookedDay(
  recipe: Pick<RecipeSchema, "last_cooked_on">,
): string | null {
  return recipe.last_cooked_on ? apiDay(recipe.last_cooked_on) : null;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** "Cooked today", "Cooked 5 days ago", "Cooked 3 weeks ago" or "Not cooked yet". */
export function cookedLabel(lastDay: string | null, today: string): string {
  if (!lastDay) return "Not cooked yet";
  const days = daysBetween(lastDay, today);
  if (days <= 0) return "Cooked today";
  if (days === 1) return "Cooked yesterday";
  if (days < 14) return `Cooked ${days} days ago`;
  if (days < 60) return `Cooked ${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `Cooked ${Math.floor(days / 30)} months ago`;
  return "Cooked over a year ago";
}

/** The same, short enough for a list row: "today", "5d", "3w", "2mo", "1y". */
export function cookedShort(lastDay: string | null, today: string): string {
  if (!lastDay) return "";
  const days = daysBetween(lastDay, today);
  if (days <= 0) return "today";
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

export type RecipeSort = "title" | "cooked";

/** By name, or the ones made longest ago first (never-made ones last, by name). */
export function sortRecipes<
  R extends Pick<RecipeSchema, "title" | "last_cooked_on">,
>(recipes: R[], sort: RecipeSort): R[] {
  const byTitle = (a: R, b: R) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  if (sort === "title") return [...recipes].sort(byTitle);
  return [...recipes].sort((a, b) => {
    const [x, y] = [lastCookedDay(a), lastCookedDay(b)];
    if (x === y) return byTitle(a, b);
    if (!x) return 1;
    if (!y) return -1;
    return x < y ? -1 : 1;
  });
}
