import { describe, expect, it } from "vitest";
import { isNonAuth0Callback } from "./auth";

describe("isNonAuth0Callback", () => {
  it("leaves Google Calendar's and the bank's redirects to their own pages", () => {
    expect(isNonAuth0Callback("/oauth/google-calendar")).toBe(true);
    expect(isNonAuth0Callback("/bank-connections/callback")).toBe(true);
  });

  it("lets Auth0 handle its own login redirect", () => {
    expect(isNonAuth0Callback("/")).toBe(false);
    expect(isNonAuth0Callback("/accounts")).toBe(false);
  });
});
