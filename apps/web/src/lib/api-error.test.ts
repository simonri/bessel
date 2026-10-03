import { describe, expect, it } from "vitest";
import { errorDetail } from "./api-error";

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
