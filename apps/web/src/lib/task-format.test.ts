import { describe, expect, it } from "vitest";
import { describeDue } from "./task-format";

const NOW = new Date(2026, 9, 8, 12); // Thursday

describe("describeDue", () => {
  it("says when a late task was due, without counting days", () => {
    expect(describeDue(new Date(2026, 9, 7), NOW)).toEqual({
      label: "Yesterday",
      tone: "overdue",
    });
    expect(describeDue(new Date(2026, 9, 5), NOW)).toEqual({
      label: "Since Mon",
      tone: "overdue",
    });
    expect(describeDue(new Date(2026, 8, 20), NOW)).toEqual({
      label: "Since Sep 20",
      tone: "overdue",
    });
  });

  it("names today and the days ahead", () => {
    expect(describeDue(new Date(2026, 9, 8), NOW)?.label).toBe("Today");
    expect(describeDue(new Date(2026, 9, 9), NOW)?.label).toBe("Tomorrow");
  });
});
