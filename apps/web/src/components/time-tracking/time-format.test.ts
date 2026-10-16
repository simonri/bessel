import type {
  TimeEntrySchema,
  TimeMonthTotal,
  TimeProjectSchema,
} from "@bessel/client";
import { describe, expect, it } from "vitest";
import {
  formatHours,
  monthRows,
  monthText,
  nextProjectColor,
  overlappingIds,
  PROJECT_COLORS,
  projectTotals,
} from "./time-format";

function project(over: Partial<TimeProjectSchema> = {}): TimeProjectSchema {
  return {
    id: "p1",
    name: "Audit",
    client: null,
    color: PROJECT_COLORS[0].hex,
    hourly_rate: null,
    currency: null,
    archived_at: null,
    created_at: new Date(),
    modified_at: null,
    ...over,
  };
}

function entry(
  id: string,
  start: string,
  end: string,
  projectId = "p1",
): TimeEntrySchema {
  return {
    id,
    time_project_id: projectId,
    start_ts: new Date(start),
    end_ts: new Date(end),
    note: null,
    created_at: new Date(),
    modified_at: null,
  };
}

describe("formatHours", () => {
  it("writes hours with up to two decimals", () => {
    expect(formatHours(3600 * 7.5)).toBe("7.5 h");
    expect(formatHours(900)).toBe("0.25 h");
    expect(formatHours(3600 * 12)).toBe("12 h");
  });
});

describe("projectTotals", () => {
  it("clips entries to the range and sorts by time", () => {
    const totals = projectTotals(
      [
        entry("a", "2026-10-05T23:00:00Z", "2026-10-06T02:00:00Z"),
        entry("b", "2026-10-06T08:00:00Z", "2026-10-06T08:30:00Z", "p2"),
      ],
      new Date("2026-10-06T00:00:00Z"),
      new Date("2026-10-07T00:00:00Z"),
    );
    expect(totals).toEqual([
      { projectId: "p1", seconds: 7200 },
      { projectId: "p2", seconds: 1800 },
    ]);
  });
});

describe("overlappingIds", () => {
  it("finds entries that share time, but not ones that only touch", () => {
    const ids = overlappingIds([
      entry("a", "2026-10-06T08:00:00Z", "2026-10-06T12:00:00Z"),
      entry("b", "2026-10-06T09:00:00Z", "2026-10-06T10:00:00Z"),
      entry("c", "2026-10-06T12:00:00Z", "2026-10-06T13:00:00Z"),
    ]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });

  it("catches an entry that overlaps a long one after a short one ends", () => {
    const ids = overlappingIds([
      entry("long", "2026-10-06T08:00:00Z", "2026-10-06T12:00:00Z"),
      entry("short", "2026-10-06T09:00:00Z", "2026-10-06T10:00:00Z"),
      entry("late", "2026-10-06T11:00:00Z", "2026-10-06T13:00:00Z"),
    ]);
    expect([...ids].sort()).toEqual(["late", "long", "short"]);
  });
});

describe("monthRows and monthText", () => {
  const totals: TimeMonthTotal[] = [
    { time_project_id: "p1", month: 10, seconds: 3600 * 30 },
    { time_project_id: "p2", month: 10, seconds: 3600 * 2.5 },
    { time_project_id: "p2", month: 9, seconds: 3600 },
  ];
  const projects = [
    project({ client: "Acme", hourly_rate: 1000, currency: "SEK" }),
    project({ id: "p2", name: "Migration", archived_at: new Date() }),
    project({ id: "p3", name: "Idle", archived_at: new Date() }),
  ];

  it("keeps projects with time or still active", () => {
    const rows = monthRows(totals, projects);
    expect(rows.map((r) => [r.project.id, r.total / 3600])).toEqual([
      ["p1", 30],
      ["p2", 3.5],
    ]);
    expect(rows[1].months[8]).toBe(3600);
  });

  it("writes a month out as text with amounts", () => {
    expect(monthText(monthRows(totals, projects), 2026, 9)).toBe(
      [
        "October 2026",
        "Acme - Audit: 30 h (30,000 SEK)",
        "Migration: 2.5 h",
        "Total: 32.5 h",
      ].join("\n"),
    );
  });
});

describe("nextProjectColor", () => {
  it("picks the first colour not yet used", () => {
    expect(nextProjectColor([project()])).toBe(PROJECT_COLORS[1].hex);
  });
});
