import { format } from "date-fns";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  endTimeOptions,
  fmtDuration,
  monthGrid,
  startTimeOptions,
} from "./event-fields";

describe("startTimeOptions", () => {
  it("lists every 15 minutes of the day", () => {
    const options = startTimeOptions(new Date(2026, 9, 6, 12));
    expect(options).toHaveLength(96);
    expect(options[0].value).toEqual(new Date(2026, 9, 6, 0));
    expect(options[95].value).toEqual(new Date(2026, 9, 6, 23, 45));
  });

  it("keeps an off-grid current time, in order", () => {
    const current = new Date(2026, 9, 6, 12, 10);
    const options = startTimeOptions(current);
    expect(options).toHaveLength(97);
    const i = options.findIndex((o) => o.value.getTime() === current.getTime());
    expect(options[i - 1].value).toEqual(new Date(2026, 9, 6, 12));
    expect(options[i + 1].value).toEqual(new Date(2026, 9, 6, 12, 15));
  });
});

describe("startTimeOptions on DST days", () => {
  beforeAll(() => {
    vi.stubEnv("TZ", "Europe/Stockholm");
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  const clock = (options: { value: Date }[]) =>
    options.map((o) => format(o.value, "yyyy-MM-dd HH:mm"));

  it("lists the clock's times when the clocks spring forward", () => {
    const options = clock(startTimeOptions(new Date(2026, 2, 29, 12)));
    expect(options).toHaveLength(92);
    expect(new Set(options).size).toBe(92);
    expect(options.every((t) => t.startsWith("2026-03-29"))).toBe(true);
    expect(options).not.toContain("2026-03-29 02:00");
    expect(options.at(-1)).toBe("2026-03-29 23:45");
  });

  it("reaches 23:45 when the clocks fall back", () => {
    const options = clock(startTimeOptions(new Date(2026, 9, 25, 12)));
    expect(options.every((t) => t.startsWith("2026-10-25"))).toBe(true);
    expect(options.at(-1)).toBe("2026-10-25 23:45");
    expect(options).toContain("2026-10-25 23:00");
  });
});

describe("endTimeOptions", () => {
  const start = new Date(2026, 9, 6, 12);

  it("runs from 15 minutes to a day after the start, with lengths", () => {
    const options = endTimeOptions(start, new Date(2026, 9, 6, 13));
    expect(options).toHaveLength(96);
    expect(options[0]).toEqual({
      value: new Date(2026, 9, 6, 12, 15),
      hint: "15m",
    });
    expect(options[3].hint).toBe("1h");
    expect(options.at(-1)).toEqual({
      value: new Date(2026, 9, 7, 12),
      hint: "24h",
    });
  });

  it("keeps a current end beyond a day", () => {
    const far = new Date(2026, 9, 8, 9);
    const options = endTimeOptions(start, far);
    expect(options.at(-1)).toEqual({ value: far, hint: "45h" });
  });
});

describe("fmtDuration", () => {
  it("reads like Notion", () => {
    expect(fmtDuration(30 * 60_000)).toBe("30m");
    expect(fmtDuration(60 * 60_000)).toBe("1h");
    expect(fmtDuration(90 * 60_000)).toBe("1h 30m");
  });
});

describe("monthGrid", () => {
  it("is six weeks from the Monday on or before the 1st", () => {
    const grid = monthGrid(new Date(2026, 9, 15));
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual(new Date(2026, 8, 28));
    expect(grid[0].getDay()).toBe(1);
  });
});
