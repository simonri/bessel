import type { RecipeBody } from "@bessel/client";
import { describe, expect, it } from "vitest";
import {
  describeRecipe,
  formatAmount,
  formatMinutes,
  matchesRecipe,
  summarizeRecipe,
} from "./recipe-meta";

const BODY: RecipeBody = {
  intro: "Krispig hemmagjord müsli",
  total_minutes: 75,
  ingredient_groups: [
    {
      title: "Torrt",
      items: [
        { amount: 5, unit: "dl", name: "havregryn" },
        { amount: 0.5, unit: "dl", name: "cashewnötter", note: "grovhackade" },
      ],
    },
    { title: "Vått", items: [{ amount: 4, unit: "msk", name: "honung" }] },
  ],
  steps: [{ text: "Blanda" }, { text: "Rosta" }],
};

describe("summarizeRecipe", () => {
  it("counts items across groups, steps and the total time", () => {
    expect(summarizeRecipe(BODY)).toEqual({
      ingredients: 3,
      steps: 2,
      minutes: 75,
    });
    expect(summarizeRecipe({})).toEqual({
      ingredients: 0,
      steps: 0,
      minutes: null,
    });
  });
});

describe("describeRecipe", () => {
  it("reads naturally and skips what's missing", () => {
    expect(describeRecipe(BODY)).toBe("3 ingredients - 2 steps - 1 h 15 min");
    expect(
      describeRecipe({ ingredient_groups: [{ items: [{ name: "a" }] }] }),
    ).toBe("1 ingredient");
    expect(describeRecipe({})).toBeNull();
  });
});

describe("formatting", () => {
  it.each([
    [1.5, "1½"],
    [0.75, "¾"],
    [0.5, "½"],
    [2, "2"],
    [1 / 3, "⅓"],
    [2.4, "2.4"],
  ])("formats amount %s as %s", (amount, text) => {
    expect(formatAmount(amount)).toBe(text);
  });

  it.each([
    [60, "1 h"],
    [45, "45 min"],
    [75, "1 h 15 min"],
  ])("formats %s minutes as %s", (minutes, text) => {
    expect(formatMinutes(minutes)).toBe(text);
  });
});

describe("matchesRecipe", () => {
  const recipe = { title: "Müsli", body: BODY };

  it("matches title, intro, group titles, ingredient names and notes", () => {
    for (const q of ["müs", "krispig", "torrt", "HONUNG", "grovhack"]) {
      expect(matchesRecipe(recipe, q)).toBe(true);
    }
    expect(matchesRecipe(recipe, "")).toBe(true);
    expect(matchesRecipe(recipe, "chocolate")).toBe(false);
  });
});
