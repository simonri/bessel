import { RecipeType } from "@bessel/client";

export const RECIPE_TYPES: RecipeType[] = [
  RecipeType.MAIN,
  RecipeType.DESSERT,
  RecipeType.OTHER,
];

export const RECIPE_TYPE_META: Record<
  RecipeType,
  { label: string; plural: string; emoji: string; hue: number }
> = {
  [RecipeType.MAIN]: { label: "Main", plural: "Mains", emoji: "🍝", hue: 45 },
  [RecipeType.DESSERT]: {
    label: "Dessert",
    plural: "Desserts",
    emoji: "🧁",
    hue: 0,
  },
  [RecipeType.OTHER]: {
    label: "Other",
    plural: "Other",
    emoji: "🥗",
    hue: 160,
  },
};

/** Soft pastel wash for a recipe type: chips, avatars, card headers. */
export function typeTint(
  type: RecipeType,
  strength = 0.14,
): React.CSSProperties {
  const { hue } = RECIPE_TYPE_META[type];
  return {
    color: `oklch(0.86 0.07 ${hue})`,
    backgroundColor: `oklch(0.78 0.09 ${hue} / ${strength})`,
  };
}

export function typeGradient(type: RecipeType): React.CSSProperties {
  const { hue } = RECIPE_TYPE_META[type];
  return {
    backgroundImage: `radial-gradient(120% 140% at 0% 0%, oklch(0.78 0.1 ${hue} / 0.28), transparent 60%), radial-gradient(120% 140% at 100% 100%, oklch(0.7 0.08 ${(hue + 40) % 360} / 0.16), transparent 55%)`,
  };
}
