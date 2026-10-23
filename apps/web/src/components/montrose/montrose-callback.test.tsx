// @vitest-environment jsdom

import type { MontroseStatusResponse } from "@bessel/client";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: true,
  loginWithRedirect: vi.fn(),
}));
const complete = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());

vi.mock("@auth0/auth0-react", () => ({ useAuth0: () => auth }));
vi.mock("@bessel/client", () => ({
  completeMontroseV1MontroseCallbackPost: complete,
}));
vi.mock("@/lib/client", () => ({ client: {} }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => (
    <a href="/accounts">{children}</a>
  ),
  useNavigate: () => navigate,
}));

const {
  MontroseCallbackPage: Page,
  MONTROSE_CONNECTED_KEY,
  takeMontroseToChoose,
} = await import("./montrose-callback");

function visit(search: string) {
  window.history.replaceState(null, "", `/montrose/callback${search}`);
  render(<Page />);
}

beforeEach(() => {
  auth.isLoading = false;
  auth.isAuthenticated = true;
  auth.loginWithRedirect.mockReset();
  complete.mockReset();
  navigate.mockReset();
  sessionStorage.clear();
});
afterEach(cleanup);

describe("Montrose callback", () => {
  it("finishes the login as the signed-in user, strips the code and opens the accounts to choose", async () => {
    complete.mockResolvedValue({ data: { accounts: [] } });

    visit("?code=c1&state=s1&iss=https%3A%2F%2Fmcp.montrose.io");

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/accounts" }),
    );
    expect(complete.mock.calls[0][0].body).toEqual({
      code: "c1",
      state: "s1",
      iss: "https://mcp.montrose.io",
    });
    expect(window.location.search).toBe("");
    expect(sessionStorage.getItem(MONTROSE_CONNECTED_KEY)).toBe("1");
  });

  it("signs in to Bessel first and comes back with the code intact", () => {
    auth.isAuthenticated = false;

    visit("?code=c1&state=s1");

    expect(auth.loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: "/montrose/callback?code=c1&state=s1" },
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it("shows the API's reason and stays put when the login is refused", async () => {
    complete.mockRejectedValue({
      detail: "The Montrose login expired. Start again from Bessel.",
    });

    visit("?code=c1&state=s1");

    expect((await screen.findByText(/login expired/)).textContent).toBe(
      "The Montrose login expired. Start again from Bessel.",
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(MONTROSE_CONNECTED_KEY)).toBeNull();
  });

  it("falls back to its own reason when the API's isn't text", async () => {
    complete.mockRejectedValue({ detail: [{ msg: "field required" }] });

    visit("?code=c1&state=s1");

    expect(
      (await screen.findByText(/couldn't complete the approval/)).textContent,
    ).toBe("Montrose couldn't complete the approval. Start again from Bessel.");
    expect(screen.queryByText(/field required/)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    ["the consent was declined", "?error=access_denied&code=c1&state=s1"],
    ["the code is missing", "?state=s1"],
    ["the state is missing", "?code=c1"],
  ])("doesn't call the API when %s", (_, search) => {
    visit(search);

    expect(screen.getByText(/Access wasn't approved/).textContent).toBe(
      "Access wasn't approved. Start again from Bessel.",
    );
    expect(complete).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("offering Montrose's accounts after connecting", () => {
  function status(linked: (string | null)[]) {
    return {
      logo: "",
      connection: {
        accounts: linked.map((bank_account_id) => ({ bank_account_id })),
      },
    } as unknown as MontroseStatusResponse;
  }

  it("offers once, right after connecting, while an account is still to bring in", () => {
    sessionStorage.setItem(MONTROSE_CONNECTED_KEY, "1");

    expect(takeMontroseToChoose(status(["b1", null]))).toBe(true);
    expect(takeMontroseToChoose(status(["b1", null]))).toBe(false);
  });

  it("doesn't offer when every account is brought in, and still uses up the mark", () => {
    sessionStorage.setItem(MONTROSE_CONNECTED_KEY, "1");

    expect(takeMontroseToChoose(status(["b1"]))).toBe(false);
    expect(sessionStorage.getItem(MONTROSE_CONNECTED_KEY)).toBeNull();
  });

  it("doesn't offer without having just connected", () => {
    expect(takeMontroseToChoose(status([null]))).toBe(false);
  });
});
