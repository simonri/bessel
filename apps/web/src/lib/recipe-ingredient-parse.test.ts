import type { RecipeIngredient } from "@bessel/client";
import { describe, expect, it } from "vitest";
import {
  formatAmount,
  parseAmount,
  parseIngredientLine,
  parseIngredientLines,
} from "./recipe-ingredient-parse";

const item = (fields: Partial<RecipeIngredient> & { name: string }) => ({
  amount: null,
  unit: null,
  note: null,
  ...fields,
});

// Same cases as services/api/src/api/tests/test_recipe_body.py
// (TestIngredientLines) — the two parsers must agree.
describe("parseIngredientLine", () => {
  it.each([
    ["5 dl havregryn", item({ amount: 5, unit: "dl", name: "havregryn" })],
    [
      "0.5 dl cashewnötter, grovhackade",
      item({
        amount: 0.5,
        unit: "dl",
        name: "cashewnötter",
        note: "grovhackade",
      }),
    ],
    ["1½ dl mandlar", item({ amount: 1.5, unit: "dl", name: "mandlar" })],
    ["¾ tsk flingsalt", item({ amount: 0.75, unit: "tsk", name: "flingsalt" })],
    [
      "5 msk honung (eller lönnsirap)",
      item({ amount: 5, unit: "msk", name: "honung", note: "eller lönnsirap" }),
    ],
    ["2 gula lökar", item({ amount: 2, name: "gula lökar" })],
    [
      "Finrivet skal från ½ apelsin",
      item({ name: "Finrivet skal från ½ apelsin" }),
    ],
    [
      "500 g nötfärs, 20 % fetthalt (gärna högrev)",
      item({
        amount: 500,
        unit: "g",
        name: "nötfärs",
        note: "20 % fetthalt; gärna högrev",
      }),
    ],
  ])("%s", (line, expected) => {
    expect(parseIngredientLine(line)).toEqual(expected);
  });

  it("reads decimal commas and leaves unknown words out of the unit", () => {
    expect(parseIngredientLine("0,5 dl grädde")).toEqual(
      item({ amount: 0.5, unit: "dl", name: "grädde" }),
    );
    expect(parseIngredientLine("3 briochebröd")).toEqual(
      item({ amount: 3, name: "briochebröd" }),
    );
  });
});

describe("formatAmount", () => {
  it.each([
    [0.5, "½"],
    [1.5, "1½"],
    [0.75, "¾"],
    [5, "5"],
    [2.4, "2.4"],
  ])("%s → %s", (amount, text) => {
    expect(formatAmount(amount)).toBe(text);
  });
});

describe("parseAmount", () => {
  it.each([
    ["1½", 1.5],
    ["0,5", 0.5],
    ["½", 0.5],
    [" 3 ", 3],
    ["", null],
    ["a lot", null],
    ["2 dl", null],
  ])("%j → %s", (text, amount) => {
    expect(parseAmount(text)).toBe(amount);
  });
});

describe("parseIngredientLines", () => {
  it("splits a pasted list, dropping markers and blank lines", () => {
    const pasted =
      "- 5 dl havregryn\n\n* 2 msk sesamfrön\n• 1 krm salt\n2. 1 st äggvita\n";
    expect(parseIngredientLines(pasted).map((i) => i.name)).toEqual([
      "havregryn",
      "sesamfrön",
      "salt",
      "äggvita",
    ]);
  });
});
