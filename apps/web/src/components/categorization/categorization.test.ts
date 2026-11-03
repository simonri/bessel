import type { CategoryRuleSchema, CategorySchema } from "@bessel/client";
import { describe, expect, it } from "vitest";
import {
  filterRules,
  groupCategories,
  plural,
  ruleConditions,
} from "./categorization";

function category(
  id: string,
  name: string,
  parent_id: string | null = null,
): CategorySchema {
  return {
    id,
    name,
    parent_id,
    slug: id,
    color: "#22c55e",
    excluded: false,
    income: false,
    transaction_count: 0,
    rule_count: 0,
    created_at: new Date("2026-10-01"),
    modified_at: null,
  };
}

function rule(
  id: string,
  pattern: string,
  category_id: string,
  overrides: Partial<CategoryRuleSchema> = {},
): CategoryRuleSchema {
  return {
    id,
    pattern,
    category_id,
    scope: "any",
    direction: null,
    mark_business: false,
    transaction_count: 0,
    created_at: new Date("2026-10-01"),
    modified_at: null,
    ...overrides,
  };
}

const tree = [
  category("company", "Företaget"),
  category("hosting", "Servrar & hosting", "company"),
  category("private", "Privat"),
  category("food", "Mat & dagligvaror", "private"),
  category("travel", "Resor", "private"),
  category("outside", "Utanför rapporter"),
];

describe("groupCategories", () => {
  it("puts each category under its group and keeps empty groups", () => {
    expect(
      groupCategories(tree).map(({ group, categories }) => [
        group.name,
        categories.map((c) => c.name),
      ]),
    ).toEqual([
      ["Företaget", ["Servrar & hosting"]],
      ["Privat", ["Mat & dagligvaror", "Resor"]],
      ["Utanför rapporter", []],
    ]);
  });
});

describe("ruleConditions", () => {
  it("names only what narrows the rule", () => {
    expect(ruleConditions(rule("r", "ICA", "food"))).toEqual([]);
    expect(
      ruleConditions(
        rule("r", "LÖN", "food", {
          scope: "private",
          direction: "credit",
          mark_business: true,
        }),
      ),
    ).toEqual(["Private accounts", "Money in", "Marks as business"]);
    expect(
      ruleConditions(
        rule("r", "AWS", "hosting", { scope: "company", direction: "debit" }),
      ),
    ).toEqual(["Company accounts", "Money out"]);
  });
});

describe("filterRules", () => {
  const byId = new Map(tree.map((c) => [c.id, c]));
  const rules = [
    rule("1", "ICA", "food"),
    rule("2", "SJ AB", "travel"),
    rule("3", "Hetzner", "hosting"),
  ];

  it("finds rules by their text or their category, ignoring case", () => {
    expect(filterRules(rules, byId, "ica").map((r) => r.id)).toEqual(["1"]);
    expect(filterRules(rules, byId, "RESOR").map((r) => r.id)).toEqual(["2"]);
    expect(filterRules(rules, byId, "  ").map((r) => r.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(filterRules(rules, byId, "dagligvaror").map((r) => r.id)).toEqual([
      "1",
    ]);
  });
});

describe("plural", () => {
  it("counts in Swedish digits", () => {
    expect(plural(1, "rule")).toBe("1 rule");
    expect(plural(1200, "transaction")).toBe("1 200 transactions");
  });
});
