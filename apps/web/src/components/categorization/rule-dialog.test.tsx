// @vitest-environment jsdom
import type {
  CategoryRulePreview,
  CategoryRuleSchema,
  CategorySchema,
} from "@bessel/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

type Saved = { path?: { rule_id: string }; body: Record<string, unknown> };

const api = vi.hoisted(() => ({
  previews: [] as Record<string, unknown>[],
  created: [] as Saved[],
  updated: [] as Saved[],
  preview: null as CategoryRulePreview | null,
}));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  previewCategoryRule: async ({ body }: { body: Record<string, unknown> }) => {
    api.previews.push(body);
    return { data: api.preview };
  },
  createCategoryRuleMutation: () => ({
    mutationFn: async (call: Saved) => {
      api.created.push(call);
      return { categorized: 1 };
    },
  }),
  updateCategoryRuleMutation: () => ({
    mutationFn: async (call: Saved) => {
      api.updated.push(call);
      return { categorized: 0 };
    },
  }),
}));

const { RuleDialog } = await import("./rule-dialog");

function category(
  id: string,
  name: string,
  parent_id: string | null,
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

const categories = [
  category("private", "Privat", null),
  category("food", "Mat", "private"),
  category("fuel", "Bensin", "private"),
];

const match = (
  id: string,
  description: string,
  overrides: Partial<CategoryRulePreview["items"][number]> = {},
) => ({
  id,
  description,
  name: null,
  transaction_date: new Date("2026-09-10"),
  amount: 12_350,
  currency: "SEK",
  direction: "debit" as const,
  category_id: null,
  by_rule: false,
  would_sort: true,
  ...overrides,
});

function mount(rule: CategoryRuleSchema | null, onOpenChange = vi.fn()) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RuleDialog
        open
        onOpenChange={onOpenChange}
        rule={rule}
        categories={categories}
      />
    </QueryClientProvider>,
  );
  return onOpenChange;
}

const save = () => screen.getByRole("button", { name: "Save rule" });

beforeAll(() => {
  // The checkboxes measure themselves.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
beforeEach(() => {
  api.previews = [];
  api.created = [];
  api.updated = [];
  api.preview = {
    match_count: 3,
    sortable_count: 1,
    items: [
      match("1", "ICA Kvantum"),
      match("2", "ICA Bensin Kista", { would_sort: false }),
      match("3", "ICA Nära", { category_id: "fuel", would_sort: false }),
    ],
  };
});
afterEach(cleanup);

describe("RuleDialog", () => {
  it("previews what a new rule matches and saves it with the shown choices", async () => {
    const onOpenChange = mount(null);

    expect(save().hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Bank text contains"), {
      target: { value: "ICA" },
    });
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "food" },
    });
    fireEvent.change(screen.getByLabelText("Direction"), {
      target: { value: "debit" },
    });

    await screen.findByText("Matches 3 transactions already here.");
    expect(
      screen.getByText("Also sort the 1 uncategorized transaction it matches"),
    ).toBeTruthy();
    expect(screen.getByText("Will be sorted")).toBeTruthy();
    expect(screen.getByText("Stays uncategorized")).toBeTruthy();
    expect(screen.getByText("Bensin - your choice")).toBeTruthy();
    expect(api.previews.at(-1)).toEqual({
      pattern: "ICA",
      scope: "any",
      direction: "debit",
      rule_id: null,
    });

    fireEvent.click(save());

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(api.created).toEqual([
      {
        body: {
          category_id: "food",
          pattern: "ICA",
          scope: "any",
          direction: "debit",
          mark_business: false,
          apply_now: true,
        },
      },
    ]);
  });

  it("doesn't preview a single character", async () => {
    mount(null);

    fireEvent.change(screen.getByLabelText("Bank text contains"), {
      target: { value: "I" },
    });

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(api.previews).toEqual([]);
    expect(
      screen.getByText("Type at least two characters to see what it matches."),
    ).toBeTruthy();
  });

  it("edits a rule in place, leaving the uncategorized alone unless asked", async () => {
    const onOpenChange = mount({
      id: "rule-1",
      pattern: "LÖN",
      category_id: "food",
      scope: "private",
      direction: "credit",
      mark_business: false,
      transaction_count: 4,
      created_at: new Date("2026-10-01"),
      modified_at: null,
    });

    await screen.findByText(
      "Matches 3 transactions already here. The 4 it sorted will follow the change.",
    );
    expect(api.previews.at(-1)).toMatchObject({ rule_id: "rule-1" });
    fireEvent.change(screen.getByLabelText("Direction"), {
      target: { value: "both" },
    });
    fireEvent.click(save());

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(api.updated).toEqual([
      {
        path: { rule_id: "rule-1" },
        body: {
          category_id: "food",
          pattern: "LÖN",
          scope: "private",
          direction: null,
          mark_business: false,
          apply_now: false,
        },
      },
    ]);
  });
});
