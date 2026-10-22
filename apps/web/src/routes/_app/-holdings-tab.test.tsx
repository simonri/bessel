// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({ Link: () => null }));

const { AccountCard } = await import("./-holdings-tab");

afterEach(cleanup);

const thisYear = new Date().getFullYear();

describe("AccountCard", () => {
  it("shows what the account is worth, what went in and what it made", () => {
    render(
      <AccountCard
        account={{
          bank_account_id: "af",
          name: "Avanza AF",
          is_business: true,
          currency: "SEK",
          holdings_value: 600000,
          cash: 316100,
          total: 916100,
          acquired_value: 500000,
          deposits: 1000000,
          withdrawals: 200000,
          net_deposits: 800000,
          growth: 116100,
          dividends: [
            { year: thisYear, amount: 5000 },
            { year: thisYear - 1, amount: 11100 },
          ],
          first_transaction: null,
        }}
      />,
    );

    expect(screen.getByText("Company")).toBeTruthy();
    expect(screen.getByText("9 161 SEK")).toBeTruthy();
    expect(screen.getByText("8 000 SEK")).toBeTruthy();
    expect(screen.getByText("+1 161 SEK").parentElement?.textContent).toContain(
      "+14.5%",
    );
    expect(screen.getByText("+1 000 SEK")).toBeTruthy();
    expect(screen.getByText("50 SEK").parentElement?.textContent).toContain(
      "161 SEK all time",
    );
  });
});

describe("AccountCard with more taken out", () => {
  it("says taken out instead of a negative put in", () => {
    render(
      <AccountCard
        account={{
          bank_account_id: "af",
          name: "Avanza AF",
          is_business: false,
          currency: "SEK",
          holdings_value: 0,
          cash: 8600,
          total: 8600,
          acquired_value: 0,
          deposits: 191715600,
          withdrawals: 199495200,
          net_deposits: -7779600,
          growth: 7788200,
          dividends: [],
          first_transaction: null,
        }}
      />,
    );

    expect(screen.getByText("Taken out")).toBeTruthy();
    expect(screen.getByText("77 796 SEK")).toBeTruthy();
    expect(screen.queryByText("Put in")).toBeNull();
  });
});
