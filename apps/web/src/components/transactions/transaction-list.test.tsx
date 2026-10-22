// @vitest-environment jsdom
import type { CategorySchema, TransactionSchema } from "@bessel/client";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/category-cell", () => ({
  CategoryCell: ({ categoryId }: { categoryId: string | null }) => (
    <span>category picker {categoryId ?? "none"}</span>
  ),
}));

const { TransactionList, groupByDay } = await import("./transaction-list");
const { TransactionPanel } = await import("./transaction-panel");

const plain = (text: string | null) =>
  (text ?? "").replace(/\s/g, " ").replace(/−/g, "-");

function tx(overrides: Partial<TransactionSchema>): TransactionSchema {
  return {
    id: "t1",
    amount: 10000,
    currency: "SEK",
    transaction_date: new Date("2026-10-20T00:00:00"),
    direction: "debit",
    description: "ICA Nära",
    category_id: "food",
    transaction_type: null,
    dedup_hash: "h",
    bank_account_id: "a1",
    raw_id: null,
    is_business: false,
    transfer_id: null,
    created_at: new Date("2026-10-20"),
    modified_at: null,
    ...overrides,
  } as TransactionSchema;
}

const categories = [
  { id: "food", name: "Mat & dagligvaror", color: "#fb923c", parent_id: "p" },
] as CategorySchema[];

function handlers() {
  return {
    onOpen: vi.fn(),
    onDelete: vi.fn(),
    onToggleBusiness: vi.fn(),
    onUnpair: vi.fn(),
    onBulkSuggestion: vi.fn(),
  };
}

function mount(
  transactions: TransactionSchema[],
  selected = new Set<string>(),
  on = handlers(),
) {
  const onSelectedChange = vi.fn();
  render(
    <TransactionList
      transactions={transactions}
      accounts={new Map([["a1", "Lönekonto"]])}
      categories={categories}
      selected={selected}
      onSelectedChange={onSelectedChange}
      handlers={on}
    />,
  );
  return { on, onSelectedChange };
}

afterEach(cleanup);

describe("groupByDay", () => {
  it("starts a group each time the day changes", () => {
    const groups = groupByDay([
      tx({ id: "a", transaction_date: new Date("2026-10-20T00:00:00") }),
      tx({ id: "b", transaction_date: new Date("2026-10-20T00:00:00") }),
      tx({ id: "c", transaction_date: new Date("2026-10-18T00:00:00") }),
    ]);
    expect(groups.map((g) => [g.key, g.transactions.map((t) => t.id)])).toEqual(
      [
        ["2026-10-20", ["a", "b"]],
        ["2026-10-18", ["c"]],
      ],
    );
  });
});

describe("TransactionList", () => {
  it("totals each day's own money, leaving out transfers and company costs", () => {
    mount([
      tx({ id: "a", amount: 10000 }),
      tx({ id: "b", amount: 50000, direction: "credit" }),
      tx({ id: "c", amount: 99900, transfer_id: "x" }),
      tx({ id: "d", amount: 77700, is_business: true }),
    ]);

    const day = screen.getByRole("region", { name: "Tue 20 Oct" });
    expect(
      plain(day.querySelector("h3")?.parentElement?.textContent ?? null),
    ).toBe("Tue 20 Oct+400 kr");
  });

  it("shows amounts with their sign and öre, and transfers without a category", () => {
    mount([
      tx({ id: "a", amount: 8950 }),
      tx({ id: "b", description: "Till sparkonto", transfer_id: "x" }),
    ]);

    expect(
      screen.getAllByText(/89,50 kr/).map((e) => plain(e.textContent)),
    ).toContain("-89,50 kr");
    const transfer = screen
      .getByRole("button", { name: /^Till sparkonto/ })
      .closest("li") as HTMLElement;
    expect(within(transfer).queryByText(/category picker/)).toBeNull();
    expect(
      within(transfer).getAllByText(/Between your accounts/).length,
    ).toBeGreaterThan(0);
  });

  it("opens a transaction when its description is clicked", () => {
    const transaction = tx({});
    const { on } = mount([transaction]);

    fireEvent.click(screen.getByRole("button", { name: /^ICA Nära/ }));

    expect(on.onOpen).toHaveBeenCalledWith(transaction);
  });

  it("selects one row, or all of them", () => {
    const { onSelectedChange } = mount([tx({ id: "a" }), tx({ id: "b" })]);

    fireEvent.click(
      screen.getAllByRole("checkbox", { name: "Select ICA Nära" })[1],
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));

    expect(onSelectedChange.mock.calls.map(([s]) => [...s])).toEqual([
      ["b"],
      ["a", "b"],
    ]);
  });

  it("says how many are selected", () => {
    mount([tx({ id: "a" }), tx({ id: "b" })], new Set(["a"]));

    expect(screen.getByText("1 selected")).toBeTruthy();
  });
});

describe("TransactionPanel", () => {
  function mountPanel(transaction: TransactionSchema) {
    const on = handlers();
    const onOpenChange = vi.fn();
    render(
      <TransactionPanel
        transaction={transaction}
        account="Lönekonto"
        categories={categories}
        handlers={on}
        onOpenChange={onOpenChange}
      />,
    );
    return { on, onOpenChange };
  }

  it("marks a company expense and deletes, closing first", () => {
    const { on, onOpenChange } = mountPanel(tx({}));

    fireEvent.click(screen.getByRole("switch", { name: "Company expense" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete transaction" }));

    expect(on.onToggleBusiness).toHaveBeenCalledWith("t1", true);
    expect(on.onDelete).toHaveBeenCalledWith(["t1"]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByText("category picker food")).toBeTruthy();
  });

  it("lets a transfer count again, and has no category for it", () => {
    const { on } = mountPanel(tx({ transfer_id: "x" }));

    fireEvent.click(
      screen.getByRole("button", { name: "It's not - count it" }),
    );

    expect(on.onUnpair).toHaveBeenCalledWith("t1");
    expect(screen.queryByText(/category picker/)).toBeNull();
  });
});
