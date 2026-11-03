// @vitest-environment jsdom
import type { CategorySchema } from "@bessel/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DeleteCall = {
  path: { category_id: string };
  query: Record<string, unknown>;
};

const api = vi.hoisted(() => ({ deleted: [] as DeleteCall[] }));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  deleteCategoryMutation: () => ({
    mutationFn: async (call: DeleteCall) => {
      api.deleted.push(call);
    },
  }),
}));

const { DeleteCategoryDialog } = await import("./delete-category-dialog");

function category(
  id: string,
  name: string,
  parent_id: string | null,
  counts: Partial<CategorySchema> = {},
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
    ...counts,
  };
}

const food = category("food", "Mat", "private", {
  transaction_count: 12,
  rule_count: 2,
});
const tree = [
  category("private", "Privat", null),
  food,
  category("groceries", "Dagligvaror", "private"),
  category("outside", "Utanför rapporter", null),
];

function mount(deleting: CategorySchema, onDone = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DeleteCategoryDialog
        category={deleting}
        categories={tree}
        onDone={onDone}
      />
    </QueryClientProvider>,
  );
  return onDone;
}

const deleteButton = () =>
  screen.getByRole("button", { name: "Delete category" });

beforeEach(() => {
  api.deleted = [];
});
afterEach(cleanup);

describe("DeleteCategoryDialog", () => {
  it("won't delete a category in use until told where its transactions go", async () => {
    const onDone = mount(food);

    expect(
      screen.getByText(
        "It has 12 transactions and 2 rules. Choose where they go.",
      ),
    ).toBeTruthy();
    expect(deleteButton().hasAttribute("disabled")).toBe(true);
    const picker = screen.getByRole("combobox");
    expect(
      [...picker.querySelectorAll("option")].map((o) => o.textContent),
    ).toEqual(["Choose where they go", "Dagligvaror"]);

    fireEvent.change(picker, { target: { value: "groceries" } });
    fireEvent.click(deleteButton());

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.deleted).toEqual([
      { path: { category_id: "food" }, query: { move_to: "groceries" } },
    ]);
  });

  it("leaves them uncategorized only when chosen", async () => {
    const onDone = mount(food);

    fireEvent.click(
      screen.getByLabelText("Leave them uncategorized and delete its 2 rules"),
    );
    fireEvent.click(deleteButton());

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.deleted).toEqual([
      { path: { category_id: "food" }, query: { leave_uncategorized: true } },
    ]);
  });

  it("deletes an unused category without asking where things go", async () => {
    const onDone = mount(tree[2]);

    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(deleteButton());

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.deleted).toEqual([
      { path: { category_id: "groceries" }, query: {} },
    ]);
  });
});
