// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: true,
  loginWithRedirect: vi.fn(),
}));
const completeConnect = vi.hoisted(() => vi.fn());

vi.mock("@auth0/auth0-react", () => ({ useAuth0: () => auth }));
vi.mock("@bessel/client", () => ({
  completeGoogleConnectV1CalendarsGoogleCallbackPost: completeConnect,
}));
vi.mock("@/lib/client", () => ({ client: {} }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

const { GoogleCalendarCallbackPage: Page } = await import(
  "./google-calendar-callback"
);

function visit(search: string) {
  window.history.replaceState(null, "", `/oauth/google-calendar${search}`);
  render(<Page />);
}

beforeEach(() => {
  auth.isLoading = false;
  auth.isAuthenticated = true;
  auth.loginWithRedirect.mockReset();
  completeConnect.mockReset();
});
afterEach(cleanup);

describe("Google Calendar OAuth callback", () => {
  it("exchanges the code as the signed-in user and strips it from the URL", async () => {
    completeConnect.mockResolvedValue({ data: { email: "me@gmail.com" } });

    visit("?code=c1&state=s1");

    expect(await screen.findByText(/me@gmail.com is syncing/)).toBeTruthy();
    expect(completeConnect).toHaveBeenCalledTimes(1);
    expect(completeConnect.mock.calls[0][0].body).toEqual({
      code: "c1",
      state: "s1",
    });
    expect(window.location.search).toBe("");
  });

  it("signs in first and comes back with the code intact", () => {
    auth.isAuthenticated = false;

    visit("?code=c1&state=s1");

    expect(auth.loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: "/oauth/google-calendar?code=c1&state=s1" },
    });
    expect(completeConnect).not.toHaveBeenCalled();
  });

  it("shows the API's reason when the connection is rejected", async () => {
    completeConnect.mockRejectedValue({
      error: "ValidationError",
      detail:
        "This sign-in was started from a different Bessel account. Start again from Bessel.",
    });

    visit("?code=c1&state=s1");

    expect(await screen.findByText(/different Bessel account/)).toBeTruthy();
  });

  it("doesn't call the API when consent was denied", () => {
    visit("?error=access_denied&state=s1");

    expect(screen.getByText(/Access wasn't granted/)).toBeTruthy();
    expect(completeConnect).not.toHaveBeenCalled();
  });
});
