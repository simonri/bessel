import { describe, expect, it } from "vitest";
import { appReturnURL } from "./oauth-app-return";

const connected = { status: "connected", email: "me@gmail.com" } as const;

describe("appReturnURL", () => {
  it("sends the result to the app that started the sign-in", () => {
    expect(
      appReturnURL("com.simonri.bessel.dev~gAAAA-token_=", connected),
    ).toBe(
      "com.simonri.bessel.dev://oauth/google-calendar?result=connected&email=me%40gmail.com",
    );
    expect(
      appReturnURL("com.simonri.bessel~token", {
        status: "failed",
        message: "Access wasn't granted.",
      }),
    ).toBe(
      "com.simonri.bessel://oauth/google-calendar?result=failed&message=Access+wasn%27t+granted.",
    );
  });

  it("stays on the page when the desktop started it", () => {
    expect(appReturnURL("gAAAA-token_=", connected)).toBeNull();
    expect(appReturnURL(null, connected)).toBeNull();
  });

  it("never sends anything to a scheme that isn't a Bessel app's", () => {
    for (const state of [
      "https~token",
      "evil~token",
      "com.simonri.besselx~token",
      "javascript:alert(1)//~token",
    ]) {
      expect(appReturnURL(state, connected)).toBeNull();
    }
  });
});
