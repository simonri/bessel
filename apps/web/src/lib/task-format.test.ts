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
    expect(describeDue(new Date(2026, 9, 8), NOW)).toEqual({
      label: "Today",
      tone: "today",
    });
    expect(describeDue(new Date(2026, 9, 9), NOW)).toEqual({
      label: "Tomorrow",
      tone: "upcoming",
    });
    expect(describeDue(new Date(2026, 9, 10), NOW)).toEqual({
      label: "Sat",
      tone: "upcoming",
    });
    expect(describeDue(new Date(2026, 9, 14), NOW)).toEqual({
      label: "Wed",
      tone: "upcoming",
    });
  });

  it("dates a task a week or more ahead", () => {
    expect(describeDue(new Date(2026, 9, 15), NOW)).toEqual({
      label: "Oct 15",
      tone: "upcoming",
    });
    expect(describeDue(new Date(2026, 10, 3), NOW)).toEqual({
      label: "Nov 3",
      tone: "upcoming",
    });
  });
});
