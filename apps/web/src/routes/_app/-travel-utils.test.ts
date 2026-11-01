import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { formatVisitedDate } from "./-travel-utils";

describe("formatVisitedDate", () => {
  describe("west of UTC", () => {
    beforeAll(() => {
      vi.stubEnv("TZ", "America/New_York");
    });
    afterAll(() => {
      vi.unstubAllEnvs();
    });

    it("shows the day visited, as the client parsed it", () => {
      expect(formatVisitedDate(new Date("2026-03-05T00:00:00Z"))).toBe(
        "Mar 5, 2026",
      );
      expect(formatVisitedDate("2026-03-05")).toBe("Mar 5, 2026");
    });
  });

  describe("east of UTC", () => {
    beforeAll(() => {
      vi.stubEnv("TZ", "Asia/Tokyo");
    });
    afterAll(() => {
      vi.unstubAllEnvs();
    });

    it("shows the day visited", () => {
      expect(formatVisitedDate(new Date("2026-03-05T00:00:00Z"))).toBe(
        "Mar 5, 2026",
      );
    });
  });

  it("is empty without a day", () => {
    expect(formatVisitedDate(null)).toBe("");
    expect(formatVisitedDate("")).toBe("");
  });
});
