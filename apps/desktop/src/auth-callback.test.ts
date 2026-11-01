import { describe, expect, it } from "vitest";
import { isLoginAnswer, loopbackAuthState } from "./auth-callback";

const AUTHORIZE = `https://tenant.auth0.com/authorize?client_id=x&state=s3cr3t&redirect_uri=${encodeURIComponent("http://127.0.0.1:41823/callback")}`;

describe("the login loopback", () => {
  it("remembers the state of a login sent to it, and nothing else's", () => {
    expect(loopbackAuthState(AUTHORIZE, 41823)).toBe("s3cr3t");
    expect(loopbackAuthState(AUTHORIZE, 41824)).toBeNull();
    expect(loopbackAuthState("https://example.com/?state=x", 41823)).toBeNull();
  });

  it("ends the attempt only for the answer to that login", () => {
    // Any page in the user's browser can request the loopback URL.
    const answer = (query: string) =>
      isLoginAnswer(new URLSearchParams(query), "s3cr3t");
    expect(answer("state=s3cr3t&code=abc")).toBe(true);
    expect(answer("state=s3cr3t&error=access_denied")).toBe(true);
    expect(answer("state=guess&error=x")).toBe(false);
    expect(answer("state=s3cr3t")).toBe(false);
    expect(isLoginAnswer(new URLSearchParams("state=&code=a"), null)).toBe(
      false,
    );
  });
});
