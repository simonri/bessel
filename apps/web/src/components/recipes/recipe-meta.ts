const BULLET_RE = /^\s*[-*+]\s+(?!\[[ xX]\]\s*$)\S/;
const NUMBERED_RE = /^\s*\d+[.)]\s+\S/;

/** Rough counts for a recipe card: bulleted lines are ingredients,
 *  numbered lines are steps — how the starter template writes them. */
export function summarizeRecipe(content: string): {
  ingredients: number;
  steps: number;
} {
  let ingredients = 0;
  let steps = 0;
  for (const line of content.split("\n")) {
    if (BULLET_RE.test(line)) ingredients++;
    else if (NUMBERED_RE.test(line)) steps++;
  }
  return { ingredients, steps };
}

export function describeRecipe(content: string): string | null {
  const { ingredients, steps } = summarizeRecipe(content);
  const parts = [
    ingredients
      ? `${ingredients} ingredient${ingredients === 1 ? "" : "s"}`
      : null,
    steps ? `${steps} step${steps === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" - ") : null;
}

export const NEW_RECIPE_TEMPLATE = `## Ingredients

- 

## Steps

1. 
`;
