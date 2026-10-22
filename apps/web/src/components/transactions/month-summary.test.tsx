// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ summary: vi.fn() }));

vi.mock("@bessel/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bessel/client")>()),
  transactionSummaryV1TransactionsSummaryGetOptions: () => ({
    queryKey: ["summary"],
    queryFn: api.summary,
  }),
}));
// Charts need a measured container; jsdom has none.
vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  ResponsiveContainer: () => null,
}));

const { MonthSummary, versusUsual } = await import("./month-summary");

function months(spending: number) {
  return Array.from({ length: 12 }, (_, i) => ({
    year: i < 3 ? 2025 : 2026,
    month: ((i + 9) % 12) + 1,
    income: 0,
    spending,
  }));
}

const SEK = {
  currency: "SEK",
  income: 3000000,
  spending: 1200000,
  net: 1800000,
  previous: { year: 2026, month: 8, income: 0, spending: 0 },
  average_income: 3000000,
  average_spending: 1000000,
  months: months(1000000),
  categories: [
    {
      category_id: "food",
      name: "Food",
      color: "#22c55e",
      total: 800000,
      count: 12,
    },
    {
      category_id: null,
      name: "Uncategorized",
      color: "#6B7280",
      total: 400000,
      count: 3,
    },
  ],
  merchants: [{ description: "ICA Kvantum", total: 500000, count: 6 }],
};

function mount(actions = {}) {
  const handlers = {
    onPickMonth: vi.fn(),
    onPickCategory: vi.fn(),
    onPickMerchant: vi.fn(),
    onShowTransfers: vi.fn(),
    ...actions,
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MonthSummary year={2026} month={9} actions={handlers} />
    </QueryClientProvider>,
  );
  return handlers;
}

afterEach(cleanup);

describe("versusUsual", () => {
  it("says how far a month is from the usual one", () => {
    expect(versusUsual(1200, 1000)).toBe("20% more than usual");
    expect(versusUsual(800, 1000)).toBe("20% less than usual");
    expect(versusUsual(1000, 1000)).toBe("Same as usual");
    expect(versusUsual(1000, 0)).toBeNull();
  });
});

describe("MonthSummary", () => {
  it("shows the month against usual and what's left out", async () => {
    api.summary.mockResolvedValue({
      year: 2026,
      month: 9,
      currencies: [SEK],
      uncategorized: 3,
      transfers: 7,
    });
    const handlers = mount();

    expect(await screen.findByText("30 000 SEK")).toBeTruthy();
    expect(screen.getByText("20% more than usual")).toBeTruthy();
    expect(screen.getByText("Saved")).toBeTruthy();
    expect(screen.getByText("18 000 SEK")).toBeTruthy();
    expect(screen.getByText("Usually saves 20 000 SEK")).toBeTruthy();

    fireEvent.click(
      screen.getByText("7 moves between your own accounts left out"),
    );
    fireEvent.click(screen.getByText("3 without a category"));
    expect(handlers.onShowTransfers).toHaveBeenCalledOnce();
    expect(handlers.onPickCategory).toHaveBeenCalledWith(null);
  });

  it("filters the list from a category or a merchant", async () => {
    api.summary.mockResolvedValue({
      year: 2026,
      month: 9,
      currencies: [SEK],
      uncategorized: 0,
      transfers: 0,
    });
    const handlers = mount();

    fireEvent.click(await screen.findByText("Food"));
    fireEvent.click(screen.getByText("Uncategorized"));
    fireEvent.click(screen.getByText("ICA Kvantum"));

    expect(handlers.onPickCategory.mock.calls).toEqual([["food"], [null]]);
    expect(handlers.onPickMerchant).toHaveBeenCalledWith("ICA Kvantum");
  });

  it("calls overspending what it is", async () => {
    api.summary.mockResolvedValue({
      year: 2026,
      month: 9,
      currencies: [{ ...SEK, income: 100000, net: -1100000 }],
      uncategorized: 0,
      transfers: 0,
    });
    mount();

    expect(await screen.findByText("Overspent")).toBeTruthy();
    expect(screen.getByText("11 000 SEK")).toBeTruthy();
  });

  it("doesn't hold a month still running up against whole ones", async () => {
    const now = new Date();
    api.summary.mockResolvedValue({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      currencies: [
        { ...SEK, average_income: 9000000, average_spending: 9500000 },
      ],
      uncategorized: 0,
      transfers: 0,
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MonthSummary
          year={now.getFullYear()}
          month={now.getMonth() + 1}
          actions={{
            onPickMonth: vi.fn(),
            onPickCategory: vi.fn(),
            onPickMerchant: vi.fn(),
            onShowTransfers: vi.fn(),
          }}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findAllByText("So far this month")).toHaveLength(2);
    expect(screen.getByText("Usually overspends 5 000 SEK")).toBeTruthy();
  });

  it("keeps each currency apart", async () => {
    const eur = {
      ...SEK,
      currency: "EUR",
      income: 50000,
      spending: 20000,
      net: 30000,
    };
    api.summary.mockResolvedValue({
      year: 2026,
      month: 9,
      currencies: [SEK, eur],
      uncategorized: 0,
      transfers: 0,
    });
    mount();

    expect(await screen.findByText("30 000 SEK")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "EUR" }));
    expect(screen.getByText("500 EUR")).toBeTruthy();
    expect(screen.queryByText("30 000 SEK")).toBeNull();
  });
});
