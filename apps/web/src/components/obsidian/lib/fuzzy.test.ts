import { describe, expect, it } from "vitest";
import { fuzzyScore } from "./fuzzy";

describe("fuzzyScore", () => {
  it("scores an exact match highest", () => {
    const exact = fuzzyScore("recipe", "recipe")!;
    const prefix = fuzzyScore("recipe", "recipes")!;
    expect(exact).toBeGreaterThan(prefix);
  });

  it("ranks a prefix match above a plain substring match", () => {
    const prefix = fuzzyScore("jour", "Journal")!;
    const substring = fuzzyScore("jour", "Bonjour")!;
    expect(prefix).toBeGreaterThan(substring);
  });

  it("ranks a substring match above a scattered subsequence match", () => {
    const substring = fuzzyScore("nal", "Journal")!;
    const subsequence = fuzzyScore("jnl", "Journal")!;
    expect(substring).toBeGreaterThan(subsequence);
  });

  it("matches an in-order subsequence", () => {
    expect(fuzzyScore("jnl", "Journal")).not.toBeNull();
  });

  it("returns null when a character is missing", () => {
    expect(fuzzyScore("xyz", "Journal")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(fuzzyScore("JOURNAL", "journal")).toBe(1000);
  });

  it("treats an empty query as a match for everything, scored lowest", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });

  it("rewards consecutive matched characters over scattered ones", () => {
    const consecutive = fuzzyScore("jour", "Journal Entry")!;
    const scattered = fuzzyScore("jrnl", "Journal Entry")!;
    expect(consecutive).toBeGreaterThan(scattered);
  });
});
