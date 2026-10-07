import { describe, expect, it } from "vitest";
import { errorDetail, isNotFoundError } from "./api-error";

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

describe("isNotFoundError", () => {
  it("recognises a 404 status or the API's not-found body", () => {
    expect(isNotFoundError({ status: 404, detail: "Gone" })).toBe(true);
    expect(
      isNotFoundError({ error: "ResourceNotFound", detail: "Task not found" }),
    ).toBe(true);
  });

  it("treats every other failure as transient", () => {
    expect(isNotFoundError({ status: 500, detail: "boom" })).toBe(false);
    expect(isNotFoundError({ error: "UnauthorizedError" })).toBe(false);
    expect(isNotFoundError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
  });
});
