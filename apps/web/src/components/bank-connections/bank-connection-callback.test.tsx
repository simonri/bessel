// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: true,
  loginWithRedirect: vi.fn(),
}));
const complete = vi.hoisted(() => vi.fn());

vi.mock("@auth0/auth0-react", () => ({ useAuth0: () => auth }));
vi.mock("@bessel/client", () => ({
  completeBankConnectionV1BankConnectionsCallbackPost: complete,
}));
vi.mock("@/lib/client", () => ({ client: {} }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => (
    <a href="/accounts">{children}</a>
  ),
}));

const { BankConnectionCallbackPage: Page } = await import(
  "./bank-connection-callback"
);

function visit(search: string) {
  window.history.replaceState(null, "", `/bank-connections/callback${search}`);
  render(<Page />);
}

function connected(linked: boolean) {
  return {
    data: {
      bank_name: "Skandia",
      accounts: [{ bank_account_id: linked ? "a1" : null }],
    },
  };
}

beforeEach(() => {
  auth.isLoading = false;
  auth.isAuthenticated = true;
  auth.loginWithRedirect.mockReset();
  complete.mockReset();
});
afterEach(cleanup);

describe("Bank connection callback", () => {
  it("completes the approval as the signed-in user and strips the code", async () => {
    complete.mockResolvedValue(connected(false));

    visit("?code=c1&state=s1");

    expect(await screen.findByText("Skandia connected")).toBeTruthy();
    expect(
      screen.getByText(/Choose which Bessel account each bank account/),
    ).toBeTruthy();
    expect(complete.mock.calls[0][0].body).toEqual({
      code: "c1",
      state: "s1",
    });
    expect(window.location.search).toBe("");
  });

  it("says imports continue when the accounts were already linked", async () => {
    complete.mockResolvedValue(connected(true));

    visit("?code=c1&state=s1");

    expect(
      await screen.findByText(/keep importing into the same accounts/),
    ).toBeTruthy();
  });

  it("signs in first and comes back with the code intact", () => {
    auth.isAuthenticated = false;

    visit("?code=c1&state=s1");

    expect(auth.loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: "/bank-connections/callback?code=c1&state=s1" },
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it("shows the API's reason when the approval is rejected", async () => {
    complete.mockRejectedValue({
      detail: "This link has expired. Connect Skandia again from Bessel.",
    });

    visit("?code=c1&state=s1");

    expect(await screen.findByText(/link has expired/)).toBeTruthy();
  });

  it("doesn't call the API when the bank approval was cancelled", () => {
    visit("?error=access_denied&code=c1&state=s1");

    expect(screen.getByText(/Access wasn't approved/)).toBeTruthy();
    expect(complete).not.toHaveBeenCalled();
  });
});
