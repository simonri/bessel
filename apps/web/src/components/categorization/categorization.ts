import type {
  CategoryRuleSchema,
  CategorySchema,
  RuleScope,
  TransactionDirection,
} from "@bessel/client";

export interface CategoryGroup {
  group: CategorySchema;
  categories: CategorySchema[];
}

/** Groups with the categories in each, empty groups included, in the API's name order. */
export function groupCategories(categories: CategorySchema[]): CategoryGroup[] {
  const byParent = new Map<string, CategorySchema[]>();
  for (const category of categories) {
    if (!category.parent_id) continue;
    const list = byParent.get(category.parent_id) ?? [];
    list.push(category);
    byParent.set(category.parent_id, list);
  }
  return categories
    .filter((c) => !c.parent_id)
    .map((group) => ({ group, categories: byParent.get(group.id) ?? [] }));
}

export const SCOPE_LABELS: Record<RuleScope, string> = {
  any: "Any account",
  private: "Private accounts",
  company: "Company accounts",
};

export const DIRECTION_LABELS: Record<TransactionDirection | "both", string> = {
  both: "Money in and out",
  debit: "Money out",
  credit: "Money in",
};

/** The conditions beyond the text, as short labels; none for a rule that looks at everything. */
export function ruleConditions(
  rule: Pick<CategoryRuleSchema, "scope" | "direction" | "mark_business">,
): string[] {
  const labels: string[] = [];
  if (rule.scope !== "any") labels.push(SCOPE_LABELS[rule.scope]);
  if (rule.direction) labels.push(DIRECTION_LABELS[rule.direction]);
  if (rule.mark_business) labels.push("Marks as business");
  return labels;
}

export function filterRules(
  rules: CategoryRuleSchema[],
  categoriesById: ReadonlyMap<string, CategorySchema>,
  query: string,
): CategoryRuleSchema[] {
  const q = query.trim().toLocaleLowerCase("sv-SE");
  if (!q) return rules;
  return rules.filter(
    (rule) =>
      rule.pattern.toLocaleLowerCase("sv-SE").includes(q) ||
      (categoriesById.get(rule.category_id)?.name ?? "")
        .toLocaleLowerCase("sv-SE")
        .includes(q),
  );
}

export function plural(count: number, word: string, many = `${word}s`) {
  return `${count.toLocaleString("sv-SE")} ${count === 1 ? word : many}`;
}

export const CATEGORY_COLORS = [
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#6b7280",
] as const;
