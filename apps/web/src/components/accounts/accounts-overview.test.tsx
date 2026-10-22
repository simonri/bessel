// @vitest-environment jsdom
import type { AccountOverview, OverviewTotal } from "@bessel/client";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const run = vi.fn();
vi.mock("@/components/accounts/account-actions", () => ({
  useAccountActions: () => ({ run, busy: false }),
}));

const { AccountList, NeedsAttention, WhereItIs } = await import(
  "./accounts-overview"
);

const plain = (text: string | null) =>
  (text ?? "").replace(/\s/g, " ").replace("−", "-");

function account(overrides: Partial<AccountOverview>): AccountOverview {
  return {
    id: "a1",
    name: "Lönekonto",
    currency: "SEK",
    base_balance: 0,
    subtype: "checking",
    is_business: false,
    include_in_net_worth: true,
    current_balance: 1_000_00,
    created_at: new Date("2026-01-01"),
    modified_at: null,
    group: "cash",
    source: {
      kind: "bank",
      label: "Skandia",
      synced_at: null,
      issue: null,
      problem: null,
    },
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

afterEach(() => {
  cleanup();
  run.mockReset();
});

describe("AccountList", () => {
  it("groups by what accounts are for, in order, with the company last", () => {
    render(
      <AccountList
        onOpen={() => {}}
        accounts={[
          account({ id: "c", name: "Företag", is_business: true }),
          account({ id: "s", name: "Buffert", subtype: "savings" }),
          account({ id: "e", name: "Lönekonto" }),
          account({
            id: "i",
            name: "ISK",
            subtype: "isk",
            holdings_value: 500_00,
          }),
        ]}
      />,
    );

    expect(
      screen.getAllByRole("region").map((r) => r.getAttribute("aria-label")),
    ).toEqual(["Everyday", "Savings", "Investments", "Company"]);
    const investments = screen.getByRole("region", { name: "Investments" });
    expect(plain(within(investments).getAllByText(/kr$/)[0].textContent)).toBe(
      "1 500 kr",
    );
  });

  it("has no company group without company accounts", () => {
    render(<AccountList onOpen={() => {}} accounts={[account({})]} />);

    expect(screen.queryByRole("region", { name: "Company" })).toBeNull();
  });

  it("leaves an account outside net worth out of its group's total", () => {
    render(
      <AccountList
        onOpen={() => {}}
        accounts={[
          account({ id: "1" }),
          account({
            id: "2",
            name: "Mum's",
            current_balance: 5_000_00,
            include_in_net_worth: false,
          }),
        ]}
      />,
    );

    const group = screen.getByRole("region", { name: "Everyday" });
    expect(plain(group.querySelector("p")?.textContent ?? null)).toBe(
      "1 000 kr",
    );
    expect(screen.getByText("Not in net worth")).toBeTruthy();
  });

  it("opens the account it was clicked on, saying whether it needs you", () => {
    const onOpen = vi.fn();
    const broken = account({
      id: "b",
      name: "Buffert",
      source: {
        kind: "manual",
        label: "Imported by hand",
        synced_at: null,
        issue: { kind: "no_transactions" },
        problem: "No transactions yet.",
      },
    });
    render(<AccountList onOpen={onOpen} accounts={[account({}), broken]} />);

    fireEvent.click(screen.getByRole("button", { name: /Buffert/ }));

    expect(onOpen).toHaveBeenCalledWith(broken);
    expect(
      screen.getByRole("button", { name: /Buffert/ }).textContent,
    ).toContain("Needs you");
    expect(
      screen.getByRole("button", { name: /Lönekonto/ }).textContent,
    ).toContain("Up to date");
  });
});

describe("NeedsAttention", () => {
  it("lists each problem with the button that fixes it", () => {
    const stale = account({
      name: "Buffert",
      source: {
        kind: "manual",
        label: "Imported by hand",
        synced_at: null,
        import_bank: "marginalen",
        problem: "Imported by hand, nothing since 2 Jul 2026.",
        issue: { kind: "import_due", day: new Date("2026-07-02T00:00:00") },
      },
    });
    render(<NeedsAttention accounts={[account({ id: "ok" }), stale]} />);

    expect(screen.getByText("Nothing new since 2 Jul")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Upload latest file" }));
    expect(run).toHaveBeenCalledWith("upload", stale);
    expect(screen.queryByText("Lönekonto")).toBeNull();
  });

  it("says all is well when nothing needs fixing", () => {
    render(<NeedsAttention accounts={[account({})]} />);

    expect(screen.getByText("All up to date")).toBeTruthy();
  });
});

describe("WhereItIs", () => {
  const totals: OverviewTotal[] = [
    {
      owner: "personal",
      currency: "SEK",
      cash: 200_00,
      investments: 300_00,
      debt: 50_00,
      net: 450_00,
    },
    {
      owner: "company",
      currency: "SEK",
      cash: 1_000_00,
      investments: 0,
      debt: 0,
      net: 1_000_00,
    },
    {
      owner: "personal",
      currency: "EUR",
      cash: 9_00,
      investments: 0,
      debt: 0,
      net: 9_00,
    },
  ];

  it("splits net worth into the company's, yours and what's owed", () => {
    const { container } = render(<WhereItIs totals={totals} currency="SEK" />);

    const text = plain(container.textContent);
    expect(text).toContain("Company1 000 kr");
    expect(text).toContain("You500 kr");
    expect(text).toContain("200 kr cash - 300 kr invested");
    expect(text).toContain("Owed-50 kr");
    expect(text).toContain("All in cash");
    expect(text).not.toContain("9 kr");
  });
});
