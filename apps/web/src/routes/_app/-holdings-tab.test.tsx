// @vitest-environment jsdom
import type {
  HoldingSchema,
  InvestmentAccountSummary,
  TradeSchema,
} from "@bessel/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const year = new Date().getFullYear();

function account(
  overrides: Partial<InvestmentAccountSummary>,
): InvestmentAccountSummary {
  return {
    bank_account_id: "isk",
    name: "ISK",
    is_business: false,
    currency: "SEK",
    holdings_value: 600000,
    cash: 50000,
    total: 650000,
    acquired_value: 500000,
    deposits: 600000,
    withdrawals: 0,
    net_deposits: 600000,
    growth: 50000,
    dividends: [
      { year, amount: 1200 },
      { year: year - 1, amount: 9900 },
    ],
    first_transaction: null,
    interest: [],
    tax: [],
    fees: [],
    ...overrides,
  };
}

function holding(overrides: Partial<HoldingSchema>): HoldingSchema {
  return {
    security_id: "s1",
    bank_account_id: "isk",
    security_name: "Investor B",
    ticker: null,
    asset_type: "stock",
    currency: "SEK",
    quantity: 10_000_000,
    avg_cost_per_unit: 0,
    cost_basis: 100000,
    current_price: null,
    current_value: 110000,
    gain_loss: 10000,
    gain_loss_pct: 10,
    ...overrides,
  } as HoldingSchema;
}

const ACCOUNTS = [
  account({ tax: [{ year, amount: -2898600 }] }),
  account({
    bank_account_id: "af",
    name: "AF",
    total: 8600,
    cash: 8600,
    holdings_value: 0,
    net_deposits: -7779600,
    growth: 7788200,
    dividends: [],
  }),
];
const HOLDINGS = [
  holding({}),
  holding({
    security_id: "s2",
    bank_account_id: "af",
    security_name: "Avanza Global",
    asset_type: "mutual_fund",
    current_value: 30000,
  }),
];

vi.mock("@tanstack/react-router", () => ({ Link: () => null }));
vi.mock("@bessel/client", () => ({
  getHoldingsV1InvestmentsHoldingsGetOptions: () => ({
    queryKey: ["holdings"],
    queryFn: async () => ({ items: HOLDINGS }),
  }),
  getInvestmentAccountsV1InvestmentsAccountsGetOptions: () => ({
    queryKey: ["accounts"],
    queryFn: async () => ({ items: ACCOUNTS }),
  }),
  getAccountsOverviewV1BankAccountsOverviewGetOptions: () => ({
    queryKey: ["overview"],
    queryFn: async () => ({
      accounts: [
        {
          id: "isk",
          source: { kind: "montrose", label: "Montrose", logo: null },
        },
        { id: "af", source: { kind: "avanza", label: "Avanza", logo: null } },
      ],
    }),
  }),
}));

const { HoldingsTab, allocation, investmentTotals } = await import(
  "./-holdings-tab"
);
const { groupByMonth, tradeTotal } = await import("./-trades-tab");

const plain = (text: string | null) =>
  (text ?? "").replace(/\s/g, " ").replace(/−/g, "-");

afterEach(cleanup);

describe("investmentTotals", () => {
  it("adds the accounts up, with this year's dividends and whether a company's is among them", () => {
    const [total] = investmentTotals(
      [
        account({}),
        account({
          total: 100,
          net_deposits: 50,
          growth: 50,
          cash: 10,
          is_business: true,
        }),
      ],
      year,
    );
    expect(total).toEqual({
      currency: "SEK",
      total: 650100,
      cash: 50010,
      netDeposits: 600050,
      growth: 50050,
      dividendsThisYear: 2400,
      interestThisYear: 0,
      taxThisYear: 0,
      feesThisYear: 0,
      hasCompany: true,
    });
  });
});

describe("costs this year", () => {
  it("adds up this year's tax, interest and fees and leaves other years out", () => {
    const [total] = investmentTotals(
      [
        account({
          tax: [
            { year, amount: -2898600 },
            { year: year - 1, amount: -100000 },
          ],
          interest: [{ year, amount: -1000 }],
          fees: [{ year, amount: -9900 }],
        }),
        account({ tax: [{ year, amount: -400 }] }),
      ],
      year,
    );
    expect([
      total.taxThisYear,
      total.interestThisYear,
      total.feesThisYear,
    ]).toEqual([-2899000, -1000, -9900]);
  });
});

describe("allocation", () => {
  it("gives each of the biggest holdings its share and adds up the rest", () => {
    const slices = allocation(
      [10, 40, 30, 20].map((v, i) =>
        holding({
          security_id: `s${i}`,
          security_name: `H${v}`,
          current_value: v,
        }),
      ),
      2,
    );
    expect(slices.map((s) => [s.label, s.share])).toEqual([
      ["H40", 0.4],
      ["H30", 0.3],
      ["2 more", 0.3],
    ]);
  });

  it("is empty when nothing has a value", () => {
    expect(allocation([holding({ current_value: null })])).toEqual([]);
  });
});

describe("trades", () => {
  const trade = (date: string, overrides: Partial<TradeSchema> = {}) =>
    ({
      id: date,
      trade_date: new Date(`${date}T00:00:00`),
      quantity: 2_500_000,
      price_per_unit: 10050,
      ...overrides,
    }) as TradeSchema;

  it("groups by month and totals units times price", () => {
    expect(
      groupByMonth([
        trade("2026-10-02"),
        trade("2026-10-01"),
        trade("2026-09-30"),
      ]).map((g) => [g.label, g.trades.length]),
    ).toEqual([
      ["October 2026", 2],
      ["September 2026", 1],
    ]);
    expect(tradeTotal(trade("2026-10-02"))).toBe(25125);
  });
});

describe("HoldingsTab", () => {
  function mount() {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <HoldingsTab />
      </QueryClientProvider>,
    );
  }

  it("shows everything together, and one account when it's picked", async () => {
    mount();

    expect(plain((await screen.findByText(/^6\s586 kr$/)).textContent)).toBe(
      "6 586 kr",
    );
    expect(screen.getByText("Avanza Global")).toBeTruthy();
    expect(screen.getByText("10 units - AF")).toBeTruthy();
    expect(plain(screen.getByText(/^This year/).textContent)).toBe(
      "This year Tax -28 986 kr",
    );
    expect(screen.getByText("10 shares - ISK")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^ISK/ }));

    expect(screen.queryByText("Avanza Global")).toBeNull();
    const overview = screen.getByText("All your investments").parentElement;
    expect(plain(overview?.textContent ?? null)).toContain("6 500 kr");
    expect(plain(overview?.textContent ?? null)).not.toContain("6 586 kr");
    expect(screen.getAllByText(/^6\s500 kr$/).length).toBeGreaterThan(0);
  });

  it("shows where each account comes from, not one broker for all", async () => {
    mount();

    const isk = await screen.findByRole("button", { name: /^ISK/ });
    const af = screen.getByRole("button", { name: /^AF/ });
    await vi.waitFor(() =>
      expect(isk.querySelector("img")?.getAttribute("src")).toBe(
        "/brands/montrose.png",
      ),
    );
    expect(af.querySelector("img")?.getAttribute("src")).toBe(
      "/brands/avanza.png",
    );
  });

  it("says taken out when more came out of an account than went in", async () => {
    mount();

    const af = await screen.findByRole("button", { name: /^AF/ });
    expect(plain(af.textContent)).toContain("Taken out 77 796 kr");
  });
});
