// @vitest-environment jsdom
import type { AccountOverview } from "@bessel/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, search }: { children: ReactNode; search: unknown }) => (
    <a href={`/transactions?${JSON.stringify(search)}`}>{children}</a>
  ),
}));
vi.mock("@/components/edit-account-dialog", () => ({
  EditAccountDialog: () => null,
}));

const { AccountGroups, NetWorth, cashHistory } = await import(
  "./accounts-overview"
);

function account(overrides: Partial<AccountOverview>): AccountOverview {
  return {
    id: "a1",
    name: "Skandia",
    currency: "SEK",
    base_balance: 0,
    subtype: "checking",
    is_business: false,
    current_balance: 52361,
    created_at: new Date("2026-01-01"),
    modified_at: null,
    group: "cash",
    source: { kind: "bank", label: "Skandia", synced_at: null, problem: null },
    bank_balance: null,
    balance_drift: null,
    holdings_value: null,
    first_transaction: null,
    last_transaction: null,
    transaction_count: 0,
    history: [],
    ...overrides,
  } as AccountOverview;
}

afterEach(cleanup);

describe("cashHistory", () => {
  it("adds up personal cash per month, leaving out the company, investments, debt and other currencies", () => {
    const sep = new Date("2026-09-01T00:00:00");
    const oct = new Date("2026-10-01T00:00:00");
    const history = [
      { month: sep, balance: 100 },
      { month: oct, balance: 200 },
    ];
    const accounts = [
      account({ id: "1", history }),
      account({ id: "2", history: [{ month: oct, balance: 50 }] }),
      account({ id: "3", is_business: true, history }),
      account({ id: "4", group: "investments", history }),
      account({ id: "6", group: "credit", history }),
      account({ id: "5", currency: "EUR", history }),
    ];

    expect(cashHistory(accounts, "SEK")).toEqual([
      { month: "2026-09-01", balance: 100 },
      { month: "2026-10-01", balance: 250 },
    ]);
  });
});

describe("NetWorth", () => {
  it("counts the company you own toward net worth, shown apart from your own", () => {
    render(
      <NetWorth
        totals={[
          {
            owner: "personal",
            currency: "SEK",
            cash: 466000,
            investments: 1000000,
            debt: 10900,
            net: 1455100,
          },
          {
            owner: "company",
            currency: "SEK",
            cash: 300000,
            investments: 3700000,
            debt: 0,
            net: 4000000,
          },
        ]}
      />,
    );

    expect(screen.getAllByText("Net worth")).toHaveLength(1);
    expect(screen.getByText("54 551 SEK")).toBeTruthy();
    expect(
      screen.getByText("Yours and your company's, before tax"),
    ).toBeTruthy();
    expect(screen.getByText("14 551 SEK")).toBeTruthy();
    expect(screen.getByText("40 000 SEK")).toBeTruthy();
    expect(screen.getByText("109 SEK")).toBeTruthy();
  });

  it("keeps the plain wording without a company", () => {
    render(
      <NetWorth
        totals={[
          {
            owner: "personal",
            currency: "SEK",
            cash: 466000,
            investments: 0,
            debt: 0,
            net: 466000,
          },
        ]}
      />,
    );

    expect(screen.queryByText("Your company")).toBeNull();
    expect(
      screen.getByText("Cash and investments, minus what you owe"),
    ).toBeTruthy();
  });
});

describe("AccountGroups", () => {
  it("groups by owner, flags what needs attention and links to each account's transactions", () => {
    render(
      <AccountGroups
        data={{
          totals: [],
          accounts: [
            account({
              id: "skandia",
              source: {
                kind: "bank",
                label: "Skandia",
                synced_at: null,
                problem: "Skandia says 523,61 SEK, Bessel 528,61 SEK.",
              },
            }),
            account({
              id: "af",
              name: "Avanza AF",
              group: "investments",
              holdings_value: 900000,
              current_balance: 8635,
            }),
            account({
              id: "marginalen",
              name: "Marginalen",
              is_business: true,
            }),
          ],
        }}
        onDelete={() => {}}
      />,
    );

    expect(screen.getByText("Your accounts")).toBeTruthy();
    expect(screen.getByText("Company accounts")).toBeTruthy();
    expect(screen.getByText("1 needs attention")).toBeTruthy();
    expect(
      screen.getByText("Skandia says 523,61 SEK, Bessel 528,61 SEK."),
    ).toBeTruthy();
    // An investment account is worth its holdings plus its cash.
    expect(screen.getByText("9 086,35 SEK")).toBeTruthy();
    const link = screen.getByText("Avanza AF").closest("a");
    expect(link?.getAttribute("href")).toBe(
      '/transactions?{"bank_account_id":["af"]}',
    );
  });
});
