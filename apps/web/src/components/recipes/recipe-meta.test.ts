import { describe, expect, it } from "vitest";
import { describeRecipe, summarizeRecipe } from "./recipe-meta";

describe("summarizeRecipe", () => {
  it("counts bullets as ingredients and numbered lines as steps", () => {
    const md =
      "## Ingredients\n\n- pasta\n* tomatoes\n+ garlic\n\n## Steps\n\n1. Boil\n2) Fry\n\n> tip";
    expect(summarizeRecipe(md)).toEqual({ ingredients: 3, steps: 2 });
  });

  it("ignores the empty lines of a fresh template", () => {
    expect(summarizeRecipe("- \n1. \n")).toEqual({ ingredients: 0, steps: 0 });
  });
});

describe("describeRecipe", () => {
  it("reads naturally and skips what's missing", () => {
    expect(describeRecipe("- a\n- b\n1. go")).toBe("2 ingredients - 1 step");
    expect(describeRecipe("- a")).toBe("1 ingredient");
    expect(describeRecipe("just text")).toBeNull();
  });
});
