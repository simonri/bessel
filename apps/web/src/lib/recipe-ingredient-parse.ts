import type { RecipeIngredient } from "@bessel/client";

// Mirrors services/api/src/api/recipes/body.py (parse_ingredient_line,
// format_amount) so a line typed or pasted here becomes the same ingredient
// the API would make of it. Keep both in sync — the tests share their cases.

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 1 / 2,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
};

const AMOUNT_RE = /^(\d+(?:[.,]\d+)?)?\s*([½¼¾⅓⅔])?(?=\s|$)/;
const TRAILING_PAREN_RE = /\s*\(([^)]*)\)\s*$/;
const LIST_MARKER_RE = /^(?:[-*•]\s+|\d+[.)]\s+)/;

// biome-ignore format: grouped like the Python set
const UNITS = new Set([
  "dl", "cl", "ml", "l", "msk", "tsk", "krm", "g", "kg", "hg", "st", "skiva", "skivor", "nypa", "nypor",
  "burk", "burkar", "paket", "förp", "klyfta", "klyftor", "kvist", "kvistar", "knippe", "påse",
  "tbsp", "tsp", "cup", "cups", "oz", "lb",
]);

function splitAmount(text: string): [number | null, string] {
  const match = AMOUNT_RE.exec(text);
  if (!match || !(match[1] || match[2])) return [null, text];
  let value = 0;
  if (match[1]) value += Number(match[1].replace(",", "."));
  if (match[2]) value += UNICODE_FRACTIONS[match[2]];
  return [value, text.slice(match[0].length).trim()];
}

/** A whole field like "1½", "0,5" or "½" as a number; null if it isn't one. */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const [amount, rest] = splitAmount(trimmed);
  return rest === "" ? amount : null;
}

function partition(text: string, sep: string): [string, string, string] {
  const at = text.indexOf(sep);
  if (at < 0) return [text, "", ""];
  return [text.slice(0, at), sep, text.slice(at + sep.length)];
}

/** "0.5 dl cashewnötter, grovhackade" → amount 0.5, unit dl, name, note. */
export function parseIngredientLine(line: string): RecipeIngredient {
  const text = line.trim();
  const [amount, afterAmount] = splitAmount(text);
  let rest = afterAmount;
  let unit: string | null = null;
  if (amount !== null) {
    const [first, , remainder] = partition(rest, " ");
    if (UNITS.has(first.toLowerCase().replace(/\.+$/, "")) && remainder) {
      unit = first;
      rest = remainder.trim();
    }
  } else {
    rest = text;
  }
  let note: string | null = null;
  const paren = TRAILING_PAREN_RE.exec(rest);
  if (paren) {
    note = paren[1].trim();
    rest = rest.slice(0, paren.index).trim();
  }
  const [name, sep, after] = partition(rest, ", ");
  if (sep) note = note ? `${after.trim()}; ${note}` : after.trim();
  return { amount, unit, name: name.trim() || text, note: note || null };
}

/** Pasted text, one ingredient per line; list markers and blanks dropped. */
export function parseIngredientLines(text: string): RecipeIngredient[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(LIST_MARKER_RE, "").trim())
    .filter(Boolean)
    .map(parseIngredientLine);
}

const GLYPHS: Record<string, string> = { "1/2": "½", "1/4": "¼", "3/4": "¾" };

// Python's Fraction.limit_denominator(4): the closest fraction with a
// denominator of at most 4.
function closestQuarterish(value: number): [number, number] {
  let best: [number, number] = [0, 1];
  let bestError = Number.POSITIVE_INFINITY;
  for (let d = 1; d <= 4; d++) {
    const n = Math.round(value * d);
    const error = Math.abs(value - n / d);
    if (error < bestError - 1e-12) {
      best = [n, d];
      bestError = error;
    }
  }
  return best;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function formatAmount(amount: number): string {
  const whole = Math.trunc(amount);
  const [n, d] = closestQuarterish(amount - whole);
  const g = gcd(n, d) || 1;
  const glyph = GLYPHS[`${n / g}/${d / g}`];
  if (glyph) return whole ? `${whole}${glyph}` : glyph;
  return String(Number(amount.toPrecision(6)));
}
