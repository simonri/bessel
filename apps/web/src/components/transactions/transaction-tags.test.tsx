// @vitest-environment jsdom
import type { CategorySchema, TransactionSchema } from "@bessel/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  tags: vi.fn(),
  update: vi.fn(),
  bulk: vi.fn(),
}));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  listTransactionTagsOptions: (options?: { query?: unknown }) => ({
    queryKey: ["tags", options?.query ?? null],
    queryFn: () => api.tags(options?.query),
  }),
  updateTransactionMutation: () => ({ mutationFn: api.update }),
  tagTransactionsMutation: () => ({ mutationFn: api.bulk }),
}));
vi.mock("@/components/category-cell", () => ({
  CategoryCell: () => <span>category picker</span>,
}));
vi.mock("./transaction-documents", () => ({
  TransactionDocuments: () => null,
}));

const { retag, tidyTag, TagsField, BulkTags, TagTotals } = await import(
  "./transaction-tags"
);
const { TransactionList } = await import("./transaction-list");
const { TransactionPanel } = await import("./transaction-panel");

function tx(overrides: Partial<TransactionSchema>): TransactionSchema {
  return {
    id: "t1",
    amount: 10000,
    currency: "SEK",
    transaction_date: new Date("2026-10-20"),
    direction: "debit",
    description: "Hotel Avenida",
    category_id: null,
    transaction_type: null,
    dedup_hash: "h",
    bank_account_id: "a1",
    raw_id: null,
    is_business: false,
    transfer_id: null,
    tags: [],
    reviewed: true,
    created_at: new Date("2026-10-20"),
    modified_at: null,
    ...overrides,
  } as TransactionSchema;
}

function handlers() {
  return {
    onOpen: vi.fn(),
    onDelete: vi.fn(),
    onToggleBusiness: vi.fn(),
    onUnpair: vi.fn(),
    onBulkSuggestion: vi.fn(),
    onReview: vi.fn(),
  };
}

function wrap(children: ReactNode) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {children}
    </QueryClientProvider>
  );
}

const plain = (text: string | null) =>
  (text ?? "").replace(/\s/g, " ").replace(/−/g, "-");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("tidyTag", () => {
  it("keeps the case and single-spaces it, like the server", () => {
    expect(tidyTag("  Lisbon   2026 ")).toBe("Lisbon 2026");
    expect(tidyTag("x".repeat(60))).toHaveLength(50);
  });
});

describe("retag", () => {
  it("takes off in any case and adds each tag once", () => {
    expect(retag(["Work", "Lisbon"], ["lisbon", "Receipts"], ["work"])).toEqual(
      ["Lisbon", "Receipts"],
    );
  });
});

describe("the list's rows", () => {
  it("show the first two tags and how many more", () => {
    render(
      wrap(
        <TransactionList
          transactions={[tx({ tags: ["Lisbon", "Work", "Receipts"] })]}
          accounts={new Map()}
          categories={[] as CategorySchema[]}
          selected={new Set()}
          onSelectedChange={vi.fn()}
          handlers={handlers()}
        />,
      ),
    );
    expect(screen.getByText("Lisbon")).toBeTruthy();
    expect(screen.getByText("Work")).toBeTruthy();
    expect(screen.queryByText("Receipts")).toBeNull();
    expect(screen.getByText("+1")).toBeTruthy();
  });

  it("can each be marked reviewed while reviewing, and not otherwise", () => {
    const on = handlers();
    const list = (reviewing: boolean) => (
      <TransactionList
        transactions={[tx({ reviewed: false })]}
        accounts={new Map()}
        categories={[] as CategorySchema[]}
        selected={new Set()}
        onSelectedChange={vi.fn()}
        handlers={on}
        reviewing={reviewing}
      />
    );
    const { rerender } = render(wrap(list(false)));
    expect(screen.queryByLabelText("Mark Hotel Avenida reviewed")).toBeNull();

    rerender(wrap(list(true)));
    fireEvent.click(screen.getByLabelText("Mark Hotel Avenida reviewed"));
    expect(on.onReview).toHaveBeenCalledWith(["t1"], true);
  });
});

describe("the panel", () => {
  it("marks it reviewed, or back to review", () => {
    const on = handlers();
    api.tags.mockResolvedValue({ items: [] });
    const { rerender } = render(
      wrap(
        <TransactionPanel
          transaction={tx({ reviewed: false })}
          account="Checking"
          categories={[]}
          handlers={on}
          onOpenChange={vi.fn()}
        />,
      ),
    );
    fireEvent.click(screen.getByRole("switch", { name: "Reviewed" }));
    expect(on.onReview).toHaveBeenLastCalledWith(["t1"], true);

    rerender(
      wrap(
        <TransactionPanel
          transaction={tx({ reviewed: true })}
          account="Checking"
          categories={[]}
          handlers={on}
          onOpenChange={vi.fn()}
        />,
      ),
    );
    fireEvent.click(screen.getByRole("switch", { name: "Reviewed" }));
    expect(on.onReview).toHaveBeenLastCalledWith(["t1"], false);
  });
});

describe("TagsField", () => {
  it("offers the user's own tags as they type, in any case, and saves them as written", async () => {
    api.tags.mockResolvedValue({
      items: [
        { tag: "Lisbon 2026", count: 4, totals: [] },
        { tag: "Work", count: 2, totals: [] },
      ],
    });
    api.update.mockResolvedValue(tx({ tags: ["Lisbon 2026"] }));
    render(wrap(<TagsField transaction={tx({ tags: ["Receipts"] })} />));

    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "lisb" } });
    const lisbon = await screen.findByRole("button", { name: "Lisbon 2026" });
    expect(screen.queryByRole("button", { name: "Work" })).toBeNull();
    fireEvent.click(lisbon);

    await waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(api.update.mock.calls[0][0]).toMatchObject({
      path: { transaction_id: "t1" },
      body: { tags: ["Receipts", "Lisbon 2026"] },
    });
  });

  it("keeps a new tag's case", async () => {
    api.tags.mockResolvedValue({ items: [] });
    api.update.mockResolvedValue(tx({}));
    render(wrap(<TagsField transaction={tx({})} />));

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Ask  the accountant" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(api.update.mock.calls[0][0].body).toEqual({
      tags: ["Ask the accountant"],
    });
  });
});

describe("BulkTags", () => {
  it("adds to all of them, and takes off a tag any of them has", async () => {
    api.tags.mockResolvedValue({ items: [] });
    api.bulk.mockResolvedValue({ updated: 2 });
    const selected = [
      tx({ id: "a", tags: ["Work"] }),
      tx({ id: "b", tags: ["Lisbon"] }),
    ];
    render(wrap(<BulkTags transactions={selected} />));

    fireEvent.click(screen.getByRole("button", { name: "Tag" }));
    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "Receipts" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(
      screen.getByRole("button", { name: "Add to 2 transactions" }),
    );

    await waitFor(() => expect(api.bulk).toHaveBeenCalledTimes(1));
    expect(api.bulk.mock.calls[0][0].body).toEqual({
      ids: ["a", "b"],
      add: ["Receipts"],
    });

    fireEvent.click(screen.getByRole("button", { name: "Tag" }));
    const lisbon = (await screen.findByText("Lisbon")).closest("span");
    fireEvent.click(lisbon?.querySelector("button") as HTMLElement);
    await waitFor(() => expect(api.bulk).toHaveBeenCalledTimes(2));
    expect(api.bulk.mock.calls[1][0].body).toEqual({
      ids: ["a", "b"],
      remove: ["Lisbon"],
    });
  });
});

describe("TagTotals", () => {
  it("shows the month's spending per tag and currency, and lists a tag picked", async () => {
    api.tags.mockResolvedValue({
      items: [
        {
          tag: "Lisbon",
          count: 3,
          totals: [
            { currency: "SEK", spent: 150000, received: 0 },
            { currency: "EUR", spent: 40000, received: 15000 },
          ],
        },
      ],
    });
    const onPickTag = vi.fn();
    const from = new Date("2026-10-01T00:00:00Z");
    const to = new Date("2026-10-31T00:00:00Z");
    render(
      wrap(<TagTotals dateFrom={from} dateTo={to} onPickTag={onPickTag} />),
    );

    const row = (await screen.findByText("Lisbon")).closest("button");
    expect(api.tags).toHaveBeenCalledWith({ date_from: from, date_to: to });
    const text = plain(row?.textContent ?? null);
    expect(text).toContain("1 500");
    expect(text).toContain("400");
    expect(text).toContain("+150");
    fireEvent.click(row as HTMLElement);
    expect(onPickTag).toHaveBeenCalledWith("Lisbon");
  });

  it("shows nothing when nothing is tagged", async () => {
    api.tags.mockResolvedValue({ items: [] });
    const { container } = render(
      wrap(
        <TagTotals
          dateFrom={new Date()}
          dateTo={new Date()}
          onPickTag={vi.fn()}
        />,
      ),
    );
    await waitFor(() => expect(api.tags).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
