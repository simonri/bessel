// @vitest-environment jsdom
import type {
  InvestmentAccountSummary,
  InvestmentAllocationResponse,
  InvestmentPerformanceResponse,
  PeriodReturns,
} from "@bessel/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function account(
  overrides: Partial<InvestmentAccountSummary>,
): InvestmentAccountSummary {
  return {
    bank_account_id: "isk",
    name: "ISK",
    is_business: false,
    currency: "SEK",
    holdings_value: 0,
    cash: 0,
    total: 0,
    acquired_value: 0,
    deposits: 0,
    withdrawals: 0,
    net_deposits: 0,
    growth: 0,
    dividends: [],
    interest: [],
    tax: [],
    fees: [],
    first_transaction: null,
    ...overrides,
  };
}

function returns(overrides: Partial<PeriodReturns>): PeriodReturns {
  return {
    bank_account_id: null,
    currency: "SEK",
    range: "1y",
    start: day("2025-10-01"),
    end: day("2026-10-01"),
    start_value: 100000,
    end_value: 120000,
    net_flows: 10000,
    gain: 10000,
    time_weighted: 0.0834,
    time_weighted_annualized: null,
    time_weighted_unavailable: null,
    money_weighted: 0.0712,
    money_weighted_annualized: null,
    money_weighted_unavailable: null,
    ...overrides,
  };
}

const ACCOUNTS = [
  account({}),
  account({ bank_account_id: "kf", name: "KF", is_business: true }),
];
const PERFORMANCE: InvestmentPerformanceResponse = {
  series: [
    {
      bank_account_id: null,
      currency: "SEK",
      points: [
        { day: day("2025-10-01"), value: 100000 },
        { day: day("2026-10-01"), value: 120000 },
      ],
    },
    { bank_account_id: "isk", currency: "SEK", points: [] },
  ],
  returns: [
    returns({
      time_weighted_annualized: 0.0412,
      money_weighted_annualized: 0.0712,
    }),
    returns({
      bank_account_id: "kf",
      time_weighted: null,
      money_weighted: null,
      time_weighted_unavailable: "No money moved in or out.",
      money_weighted_unavailable: "No money moved in or out.",
    }),
    returns({
      bank_account_id: "isk",
      time_weighted: null,
      time_weighted_unavailable: "Bessel needs values from two different days.",
      money_weighted: null,
      gain: null,
    }),
    returns({ range: "3m", time_weighted: -0.021 }),
  ],
  left_out: [{ bank_account_id: "kf", name: "KF", reason: "No money moved" }],
};
const ALLOCATION: InvestmentAllocationResponse = {
  items: [
    {
      currency: "SEK",
      total: 120000,
      by_asset_type: [
        { key: "mutual_fund", label: "Funds", value: 90000, share: 0.75 },
        { key: "cash", label: "Cash", value: 30000, share: 0.25 },
      ],
      by_account: [{ key: "isk", label: "ISK", value: 120000, share: 1 }],
      borrowed: 0,
      unpriced: 1,
    },
  ],
};

vi.mock("@bessel/client", () => ({
  getInvestmentPerformanceOptions: () => ({
    queryKey: ["performance"],
    queryFn: async () => PERFORMANCE,
  }),
  getInvestmentAllocationOptions: () => ({
    queryKey: ["allocation"],
    queryFn: async () => ALLOCATION,
  }),
  getInvestmentAccountsOptions: () => ({
    queryKey: ["accounts"],
    queryFn: async () => ({ items: ACCOUNTS }),
  }),
}));
// Recharts measures its container, which jsdom doesn't lay out.
vi.mock("recharts", async (original) => ({
  ...(await original<typeof import("recharts")>()),
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div style={{ width: 600, height: 200 }}>{children}</div>
  ),
}));

const { OverviewTab, accountColors, formatReturn, pointsFrom, returnsFor } =
  await import("./-overview-tab");

const plain = (text: string | null) =>
  (text ?? "").replace(/\s/g, " ").replace(/−/g, "-");

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);
afterAll(() => vi.restoreAllMocks());

describe("formatReturn", () => {
  it("signs a return by its direction with a decimal comma", () => {
    expect(formatReturn(0.0834)).toBe("+8,3%");
    expect(formatReturn(-0.021)).toBe("-2,1%");
    expect(formatReturn(-0.0004)).toBe("0,0%");
  });
});

describe("pointsFrom", () => {
  it("starts on the day the returns are measured from", () => {
    const points = [
      { day: day("2026-01-01"), value: 1 },
      { day: day("2026-02-01"), value: 2 },
      { day: day("2026-03-01"), value: 3 },
    ];
    expect(
      pointsFrom(points, new Date(2026, 1, 1)).map((p) => p.value),
    ).toEqual([2, 3]);
    expect(pointsFrom(points, null)).toHaveLength(3);
  });
});

describe("returnsFor", () => {
  it("finds the account's or total's returns for the range", () => {
    expect(
      returnsFor(PERFORMANCE.returns, null, "SEK", "3m")?.time_weighted,
    ).toBe(-0.021);
    expect(returnsFor(PERFORMANCE.returns, null, "EUR", "3m")).toBeUndefined();
  });
});

describe("accountColors", () => {
  it("keeps an account's colour by its place in the list, not its size", () => {
    const colors = accountColors([
      { bank_account_id: "a" },
      { bank_account_id: "b" },
    ]);
    const without = accountColors([{ bank_account_id: "a" }]);
    expect(colors.get("a")).toBe(without.get("a"));
    expect(colors.get("a")).not.toBe(colors.get("b"));
  });
});

describe("OverviewTab", () => {
  function renderTab() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <OverviewTab />
      </QueryClientProvider>,
    );
  }

  it("shows the total's returns for the range and switches with it", async () => {
    renderTab();

    expect(await screen.findByText("+8,3%")).toBeTruthy();
    // The KF is the company's, so the total isn't only the user's own.
    expect(screen.getByText("Yours and your company's")).toBeTruthy();
    expect(screen.getByText("+7,1%")).toBeTruthy();
    // Per year only where it differs from the period's own figure.
    expect(plain(document.body.textContent)).toContain("+4,1% a year");
    expect(plain(document.body.textContent)).not.toContain("+7,1% a year");

    fireEvent.click(screen.getByRole("button", { name: "3M" }));

    expect(screen.getAllByText("-2,1%").length).toBeGreaterThan(0);
  });

  it("says why an account's return is missing rather than showing a number", async () => {
    renderTab();

    fireEvent.click(await screen.findByRole("button", { name: /^ISK/ }));

    expect(
      screen.getAllByText("Bessel needs values from two different days.")
        .length,
    ).toBe(1);
    expect(screen.queryByText("+8,3%")).toBeNull();
  });

  it("gives one reason when neither return can be worked out", async () => {
    renderTab();

    const row = await screen.findByRole("button", { name: /^KF/ });
    expect(plain(row.textContent)).toContain("Not available");
    fireEvent.click(row);

    expect(screen.getAllByText("No money moved in or out.").length).toBe(1);
    expect(screen.queryByText("Time-weighted return")).toBeNull();
  });

  it("names the accounts the total's returns leave out", async () => {
    renderTab();

    expect(
      plain((await screen.findByText(/Returns leave out/)).textContent),
    ).toContain("Returns leave out KF");
  });

  it("splits what it's in by type, cash included, and by account", async () => {
    renderTab();

    const byType = await screen.findByRole("region", { name: "By type" });
    expect(plain(byType.textContent)).toContain("Funds75%");
    expect(plain(byType.textContent)).toContain("Cash25%");
    expect(screen.getByRole("region", { name: "By account" })).toBeTruthy();
    expect(screen.getByText(/1 holding has no price/)).toBeTruthy();
  });
});
