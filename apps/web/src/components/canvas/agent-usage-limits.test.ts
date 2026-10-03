import { describe, expect, it } from "vitest";
import {
  latestLimits,
  limitLabel,
  planLabel,
  resetLabel,
} from "./agent-usage-limits";

describe("limitLabel", () => {
  it("names the windows like claude.ai does", () => {
    expect(limitLabel("session_5h")).toBe("Session limit");
    expect(limitLabel("week")).toBe("Weekly - all models");
    expect(limitLabel("Fable_weekly_scoped")).toBe("Weekly - Fable");
  });
});

describe("planLabel", () => {
  it("includes the plan's multiplier", () => {
    expect(planLabel("default_claude_max_5x")).toBe("Max (5x)");
    expect(planLabel("default_claude_max_20x")).toBe("Max (20x)");
  });

  it("falls back to the plan name", () => {
    expect(planLabel("max")).toBe("Max");
    expect(planLabel("pro")).toBe("Pro");
    expect(planLabel(null)).toBeNull();
  });
});

describe("resetLabel", () => {
  const now = new Date(2026, 9, 4, 1, 52);

  it("counts down within a day", () => {
    expect(resetLabel(new Date(2026, 9, 4, 4, 51), now)).toBe(
      "Resets in 2 hr 59 min",
    );
    expect(resetLabel(new Date(2026, 9, 4, 2, 30), now)).toBe(
      "Resets in 38 min",
    );
  });

  it("names the day and time further out", () => {
    expect(resetLabel(new Date(2026, 9, 5, 5, 0), now)).toBe(
      "Resets Mon 5:00 AM",
    );
  });

  it("rounds a reset reported just before the hour", () => {
    expect(resetLabel(new Date(2026, 9, 5, 4, 59, 59, 590), now)).toBe(
      "Resets Mon 5:00 AM",
    );
  });

  it("says when the window has already reset", () => {
    expect(resetLabel(new Date(2026, 9, 4, 1, 0), now)).toBe("Reset");
  });
});

describe("latestLimits", () => {
  it("keeps the newest report per limit, in display order", () => {
    const limits = latestLimits([
      {
        window_label: "week",
        utilization_pct: 50,
        observed_at: "2026-10-03T10:00:00Z",
      },
      {
        window_label: "Fable_weekly_scoped",
        utilization_pct: 0,
        observed_at: "2026-10-03T10:00:00Z",
      },
      {
        window_label: "week",
        utilization_pct: 55,
        observed_at: "2026-10-03T12:00:00Z",
      },
      {
        window_label: "session_5h",
        utilization_pct: 7,
        observed_at: "2026-10-03T12:00:00Z",
      },
    ]);
    expect(limits.map((l) => [l.window_label, l.utilization_pct])).toEqual([
      ["session_5h", 7],
      ["week", 55],
      ["Fable_weekly_scoped", 0],
    ]);
  });
});
