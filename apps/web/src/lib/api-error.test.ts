import { describe, expect, it } from "vitest";
import {
  errorDetail,
  errorStatus,
  isApiError,
  shouldRetryQuery,
  toApiError,
} from "./api-error";

describe("errorDetail", () => {
  it("prefers the API's message", () => {
    expect(errorDetail({ detail: "Calendar is read-only" }, "x")).toBe(
      "Calendar is read-only",
    );
    expect(errorDetail(new Error("boom"), "Fallback")).toBe("Fallback");
    expect(errorDetail({ detail: [{ msg: "bad" }] }, "Fallback")).toBe(
      "Fallback",
    );
  });
});

describe("toApiError", () => {
  it("keeps a JSON body's fields and adds the status", () => {
    const error = toApiError(
      { detail: "Not found" },
      new Response(null, { status: 404 }),
    );
    expect(errorStatus(error)).toBe(404);
    expect(errorDetail(error, "x")).toBe("Not found");
  });

  it("wraps a non-JSON body", () => {
    const error = toApiError(
      "Bad gateway",
      new Response(null, { status: 502 }),
    );
    expect(errorStatus(error)).toBe(502);
    expect(error.body).toBe("Bad gateway");
    expect(errorDetail(error, "Fallback")).toBe("Fallback");
  });

  it("leaves network failures without a status", () => {
    const error = toApiError(new TypeError("Failed to fetch"));
    expect(error).toBeInstanceOf(TypeError);
    expect(isApiError(error)).toBe(true);
    expect(errorStatus(error)).toBeUndefined();
  });

  it("only tags errors that went through the client", () => {
    expect(isApiError({ detail: "x", status: 500 })).toBe(false);
    expect(errorStatus({ status: 500 })).toBeUndefined();
  });
});

describe("shouldRetryQuery", () => {
  const failed = (status: number) =>
    toApiError({}, new Response(null, { status }));

  it("never retries a client error", () => {
    for (const status of [400, 403, 404, 409, 422]) {
      expect(shouldRetryQuery(0, failed(status))).toBe(false);
    }
  });

  it("retries a 401 once, after the token was refreshed", () => {
    expect(shouldRetryQuery(0, failed(401))).toBe(true);
    expect(shouldRetryQuery(1, failed(401))).toBe(false);
  });

  it("retries server and network errors twice", () => {
    for (const error of [
      failed(500),
      failed(503),
      toApiError(new TypeError()),
    ]) {
      expect(shouldRetryQuery(0, error)).toBe(true);
      expect(shouldRetryQuery(1, error)).toBe(true);
      expect(shouldRetryQuery(2, error)).toBe(false);
    }
  });
});
