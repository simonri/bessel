import { MissingRefreshTokenError } from "@auth0/auth0-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSessionEndedError,
  refreshAccessToken,
  setAccessTokenRefresher,
} from "./auth-token";

afterEach(() => {
  setAccessTokenRefresher(null);
});

describe("isSessionEndedError", () => {
  it("ends the session only when Auth0 says it's over", () => {
    expect(isSessionEndedError({ error: "login_required" })).toBe(true);
    expect(isSessionEndedError({ error: "consent_required" })).toBe(true);
    expect(isSessionEndedError({ error: "invalid_grant" })).toBe(true);
    expect(
      isSessionEndedError(new MissingRefreshTokenError("openid", "api")),
    ).toBe(true);
  });

  it("keeps the session through transient failures", () => {
    expect(isSessionEndedError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isSessionEndedError({ error: "timeout" })).toBe(false);
    expect(isSessionEndedError(null)).toBe(false);
  });
});

describe("refreshAccessToken", () => {
  it("does nothing while signed out", async () => {
    await expect(refreshAccessToken()).resolves.toBeUndefined();
  });

  it("shares one refresh between concurrent 401s", async () => {
    let finish!: () => void;
    const refresher = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    setAccessTokenRefresher(refresher);

    const both = Promise.all([refreshAccessToken(), refreshAccessToken()]);
    finish();
    await both;
    expect(refresher).toHaveBeenCalledTimes(1);

    refresher.mockResolvedValueOnce(undefined);
    await refreshAccessToken();
    expect(refresher).toHaveBeenCalledTimes(2);
  });

  it("swallows a failed refresh so the request reports its own error", async () => {
    setAccessTokenRefresher(() => Promise.reject(new Error("offline")));
    await expect(refreshAccessToken()).resolves.toBeUndefined();
  });
});
