// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ desktop: false }));

vi.mock("@/lib/environment", () => ({
  get isDesktop() {
    return env.desktop;
  },
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

const empty = (key: string, data: unknown) => () => ({
  queryKey: [key],
  queryFn: async () => data,
});
vi.mock("@bessel/client", () => ({
  getHoldingsOptions: empty("holdings", { items: [] }),
  getInvestmentAccountsOptions: empty("investment-accounts", { items: [] }),
  getAccountsOverviewOptions: empty("overview", { accounts: [] }),
}));

const { NoSleepYet } = await import("@/components/sleep/no-sleep-yet");
const { HoldingsTab } = await import("./-holdings-tab");

function renderWithQueries(Component: ComponentType) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Component />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  env.desktop = false;
});
afterEach(cleanup);

describe("Sleep with no nights", () => {
  it("says sleep needs the iPhone app, and that it isn't public", () => {
    render(<NoSleepYet />);

    expect(
      screen.getByText(/via the Bessel iPhone app, which isn't public yet/),
    ).toBeTruthy();
  });
});

describe("Investments with no accounts", () => {
  it("says on the web that Avanza connects from the desktop app", async () => {
    renderWithQueries(HoldingsTab);

    expect(
      await screen.findByText(/Avanza connects from the Bessel desktop app/),
    ).toBeTruthy();
  });

  it("points the desktop app at the Accounts page", async () => {
    env.desktop = true;
    renderWithQueries(HoldingsTab);

    expect(await screen.findByText(/Add Avanza on the/)).toBeTruthy();
    expect(screen.queryByText(/desktop app/)).toBeNull();
  });
});
